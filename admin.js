let adminKey = sessionStorage.getItem('activityAdminKey') || '';
let adminActivities = [];

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
  bind();
  addSlotRow();

  if (adminKey) {
    authenticate(true);
  }
});

function bind() {
  $('loginForm').addEventListener('submit', e => {
    e.preventDefault();
    adminKey = $('adminKey').value.trim();
    authenticate(false);
  });

  $('logoutBtn').addEventListener('click', logout);
  $('refreshAdminBtn').addEventListener('click', loadAdminActivities);
  $('activityForm').addEventListener('submit', saveActivity);
  $('requirement').addEventListener('change', toggleHours);
  $('addSlotBtn').addEventListener('click', () => addSlotRow());
  $('cancelEditBtn').addEventListener('click', resetForm);
}

async function authenticate(silent) {
  if (!apiReady()) {
    showAlert('กรุณาใส่ Apps Script Web App URL ใน js/config.js');
    return;
  }

  try {
    const data = await adminPost('adminAuth', {});
    if (!data.success) throw new Error(data.message || 'Admin Key ไม่ถูกต้อง');

    sessionStorage.setItem('activityAdminKey', adminKey);
    $('loginSection').classList.add('hidden');
    $('adminSection').classList.remove('hidden');
    $('logoutBtn').classList.remove('hidden');
    hideAlert();
    await loadAdminActivities();
  } catch (err) {
    sessionStorage.removeItem('activityAdminKey');
    if (!silent) showAlert(err.message);
    $('loginSection').classList.remove('hidden');
    $('adminSection').classList.add('hidden');
    $('logoutBtn').classList.add('hidden');
  }
}

function logout() {
  sessionStorage.removeItem('activityAdminKey');
  adminKey = '';
  location.reload();
}

async function loadAdminActivities() {
  try {
    const data = await adminPost('adminListActivities', {});
    if (!data.success) throw new Error(data.message);

    adminActivities = data.activities || [];
    renderTable();
    renderKpis();
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderKpis() {
  $('kpiActivities').textContent = adminActivities.length;
  $('kpiOpen').textContent = adminActivities.filter(a => a.status === 'เปิดรับ').length;
  $('kpiRegistered').textContent = adminActivities.reduce((s,a)=>s+Number(a.registered||0),0);
  $('kpiRemaining').textContent = adminActivities.reduce((s,a)=>s+Number(a.remaining||0),0);
}

function renderTable() {
  const body = $('adminTableBody');

  if (!adminActivities.length) {
    body.innerHTML = `<tr><td colspan="8" class="muted">ยังไม่มีกิจกรรม</td></tr>`;
    return;
  }

  body.innerHTML = adminActivities.map(a => `
    <tr>
      <td><strong>${esc(a.name)}</strong><br><span class="muted">${esc(a.activityId)}</span></td>
      <td>${esc(a.date)}</td>
      <td>${esc(benefitText(a))}</td>
      <td>${Number(a.capacity||0)}</td>
      <td>${Number(a.registered||0)}</td>
      <td><strong>${Number(a.remaining||0)}</strong></td>
      <td class="${a.status==='เปิดรับ'?'status-open':'status-closed'}">${esc(a.status)}</td>
      <td>
        <div class="admin-actions">
          <button class="btn btn-outline small-btn" onclick="editActivity('${jsStr(a.activityId)}')">แก้ไข</button>
          <button class="btn btn-outline small-btn" onclick="toggleStatus('${jsStr(a.activityId)}')">${a.status==='เปิดรับ'?'ปิดรับ':'เปิดรับ'}</button>
          <button class="btn btn-danger small-btn" onclick="deleteActivity('${jsStr(a.activityId)}')">ลบ</button>
        </div>
      </td>
    </tr>
  `).join('');
}

window.editActivity = function(id) {
  const a = adminActivities.find(x => x.activityId === id);
  if (!a) return;

  $('formTitle').textContent = 'แก้ไขกิจกรรม';
  $('editActivityId').value = a.activityId;
  $('activityCode').value = a.activityId;
  $('activityCode').disabled = true;
  $('activityName').value = a.name || '';
  $('activityDate').value = toInputDate(a.date);
  $('activityDetail').value = a.detail || '';
  $('startTime').value = toTimeValue(a.startTime);
  $('endTime').value = toTimeValue(a.endTime);
  $('capacity').value = a.capacity || '';
  $('requirement').value = a.requirement || '';
  $('hours').value = a.hours || '';
  $('status').value = a.status || 'เปิดรับ';
  toggleHours();

  $('slotsContainer').innerHTML = '';
  if (a.slots && a.slots.length) {
    a.slots.forEach(s => addSlotRow(s));
  } else {
    addSlotRow();
  }

  $('cancelEditBtn').classList.remove('hidden');
  window.scrollTo({top:0,behavior:'smooth'});
};

window.toggleStatus = async function(id) {
  try {
    const data = await adminPost('adminToggleStatus', { activityId:id });
    if (!data.success) throw new Error(data.message);
    showToast(data.message);
    await loadAdminActivities();
  } catch (err) { showToast(err.message,true); }
};

window.deleteActivity = async function(id) {
  const a = adminActivities.find(x => x.activityId === id);
  if (!confirm(`ลบกิจกรรม "${a?.name || id}" ?\n\nระบบจะไม่ลบประวัติการลงทะเบียนเดิม`)) return;

  try {
    const data = await adminPost('adminDeleteActivity', { activityId:id });
    if (!data.success) throw new Error(data.message);
    showToast(data.message);
    resetForm();
    await loadAdminActivities();
  } catch (err) { showToast(err.message,true); }
};

async function saveActivity(e) {
  e.preventDefault();

  const requirement = $('requirement').value;
  const needsHours = requirement === 'ชั่วโมงทุนเครือข่าย' || requirement === 'ชั่วโมงทุนคนละครึ่ง';

  if (needsHours && Number($('hours').value) <= 0) {
    showToast('กรุณาระบุจำนวนชั่วโมง', true);
    return;
  }

  const slots = collectSlots();
  if (slots === null) return;

  const editId = $('editActivityId').value;
  const payload = {
    activityId: $('activityCode').value.trim(),
    name: $('activityName').value.trim(),
    date: $('activityDate').value,
    detail: $('activityDetail').value.trim(),
    startTime: $('startTime').value,
    endTime: $('endTime').value,
    capacity: $('capacity').value,
    requirement,
    hours: needsHours ? $('hours').value : '',
    status: $('status').value,
    slots: JSON.stringify(slots)
  };

  try {
    const action = editId ? 'adminUpdateActivity' : 'adminCreateActivity';
    const data = await adminPost(action, payload);
    if (!data.success) throw new Error(data.message);

    showToast(data.message);
    resetForm();
    await loadAdminActivities();
  } catch (err) {
    showToast(err.message, true);
  }
}

function addSlotRow(slot={}) {
  const wrap = document.createElement('div');
  wrap.className = 'slot-row';
  wrap.innerHTML = `
    <input class="slot-name" placeholder="ชื่อช่วง เช่น รอบเช้า" value="${attr(slot.name||'')}">
    <input class="slot-start" type="time" value="${attr(toTimeValue(slot.startTime||''))}">
    <input class="slot-end" type="time" value="${attr(toTimeValue(slot.endTime||''))}">
    <button type="button" class="btn btn-outline small-btn">ลบ</button>
  `;
  wrap.querySelector('button').addEventListener('click', () => {
    if ($('slotsContainer').children.length === 1) {
      wrap.querySelectorAll('input').forEach(i => i.value='');
    } else {
      wrap.remove();
    }
  });
  $('slotsContainer').appendChild(wrap);
}

function collectSlots() {
  const rows = [...document.querySelectorAll('.slot-row')];
  const slots = [];

  for (const row of rows) {
    const name = row.querySelector('.slot-name').value.trim();
    const startTime = row.querySelector('.slot-start').value;
    const endTime = row.querySelector('.slot-end').value;

    if (!name && !startTime && !endTime) continue;
    if (!name || !startTime || !endTime) {
      showToast('กรุณากรอกข้อมูลช่วงเวลาให้ครบ หรือเว้นว่างทั้งแถว', true);
      return null;
    }
    slots.push({name,startTime,endTime});
  }
  return slots;
}

function toggleHours() {
  const req = $('requirement').value;
  const show = req === 'ชั่วโมงทุนเครือข่าย' || req === 'ชั่วโมงทุนคนละครึ่ง';
  $('hoursWrap').classList.toggle('hidden', !show);
  $('hours').required = show;
  if (!show) $('hours').value = '';
}

function resetForm() {
  $('activityForm').reset();
  $('editActivityId').value = '';
  $('activityCode').disabled = false;
  $('formTitle').textContent = 'สร้างกิจกรรมใหม่';
  $('cancelEditBtn').classList.add('hidden');
  $('slotsContainer').innerHTML = '';
  addSlotRow();
  toggleHours();
}

async function adminPost(action, data) {
  const body = new URLSearchParams({ action, adminKey, ...data });
  const res = await fetch(API_URL, { method:'POST', body });
  return await res.json();
}

function benefitText(a) {
  if (a.requirement === 'ชั่วโมงทุนเครือข่าย' || a.requirement === 'ชั่วโมงทุนคนละครึ่ง') {
    return `${a.requirement} ${a.hours || 0} ชม.`;
  }
  return a.requirement || '-';
}

function toInputDate(v) {
  if (!v) return '';
  const m = String(v).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return v.length >= 10 ? v.slice(0,10) : '';
  let y = Number(m[3]);
  if (y > 2400) y -= 543;
  return `${String(y).padStart(4,'0')}-${m[2]}-${m[1]}`;
}

function toTimeValue(v) {
  const m = String(v||'').match(/(\d{1,2}):(\d{2})/);
  return m ? `${String(m[1]).padStart(2,'0')}:${m[2]}` : '';
}

function apiReady() {
  return API_URL && !API_URL.includes('PUT_YOUR_');
}

function showAlert(message) {
  $('alertBox').textContent = message;
  $('alertBox').classList.remove('hidden');
}

function hideAlert(){ $('alertBox').classList.add('hidden'); }

function showToast(message,isError=false){
  const t=$('toast'); t.textContent=message;
  t.style.background=isError?'#b3261e':'#202124';
  t.classList.remove('hidden');
  clearTimeout(window.__toast);
  window.__toast=setTimeout(()=>t.classList.add('hidden'),3200);
}

function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;")}
function attr(v){return esc(v)}
function jsStr(v){return String(v??'').replaceAll('\\','\\\\').replaceAll("'","\\'")}
