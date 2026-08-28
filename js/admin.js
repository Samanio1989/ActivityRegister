let adminKey = sessionStorage.getItem('activityAdminKey') || '';
let adminActivities = [];
let selectedOverviewActivityId = '';

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
  $('overviewActivitySelect').addEventListener('change', e => {
    selectedOverviewActivityId = e.target.value;
    renderOverview();
    renderTable();
  });
  $('exportAllBtn').addEventListener('click', exportAllRegistrationsExcel);
  $('activityForm').addEventListener('submit', saveActivity);
  document.querySelectorAll('input[name="benefit"]').forEach(cb => cb.addEventListener('change', syncBenefitHours));
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
    fillOverviewActivitySelect();
    renderOverview();
    renderTable();
  } catch (err) {
    showToast(err.message, true);
  }
}

function fillOverviewActivitySelect() {
  const select = $('overviewActivitySelect');
  const previous = selectedOverviewActivityId;
  select.innerHTML = `<option value="">-- กิจกรรมทั้งหมด --</option>` +
    adminActivities.map(a => `<option value="${attr(a.activityId)}">${esc(a.name)} (${esc(a.activityId)})</option>`).join('');
  if (previous && adminActivities.some(a => a.activityId === previous)) {
    select.value = previous;
  } else {
    selectedOverviewActivityId = '';
    select.value = '';
  }
}

function renderOverview() {
  const values = [$('kpiValue1'),$('kpiValue2'),$('kpiValue3')];
  const labels = [$('kpiLabel1'),$('kpiLabel2'),$('kpiLabel3')];
  const cards = values.map(v=>v.closest('.kpi'));
  cards.forEach(c=>c.classList.remove('is-capacity','is-remaining','is-cancelled'));

  if (!selectedOverviewActivityId) {
    labels[0].textContent='กิจกรรมทั้งหมด';
    labels[1].textContent='เปิดรับอยู่';
    labels[2].textContent='ปิดรับแล้ว';
    values[0].textContent=adminActivities.length;
    values[1].textContent=adminActivities.filter(a=>a.status==='เปิดรับ').length;
    values[2].textContent=adminActivities.filter(a=>a.status!=='เปิดรับ').length;
    $('overviewDescription').textContent='แสดงภาพรวมกิจกรรมทั้งหมดในระบบ';
    $('exportAllBtn').textContent='ดาวน์โหลดรายงานทั้งหมด';
    return;
  }

  const a=adminActivities.find(x=>x.activityId===selectedOverviewActivityId);
  if(!a)return;
  labels[0].textContent='จำนวนเปิดรับทั้งหมด';
  labels[1].textContent='จำนวนที่ยังว่างปัจจุบัน';
  labels[2].textContent='ผู้ยกเลิกการลงทะเบียน';
  values[0].textContent=Number(a.capacity||0);
  values[1].textContent=Number(a.remaining||0);
  values[2].textContent=Number(a.cancelled||0);
  cards[0].classList.add('is-capacity');
  cards[1].classList.add('is-remaining');
  cards[2].classList.add('is-cancelled');
  $('overviewDescription').textContent=`${a.name} (${a.activityId})`;
  $('exportAllBtn').textContent='ดาวน์โหลดรายงานกิจกรรมนี้';
}

function renderTable() {
  const body = $('adminTableBody');
  const tableActivities = selectedOverviewActivityId
    ? adminActivities.filter(a => a.activityId === selectedOverviewActivityId)
    : adminActivities;

  if (!tableActivities.length) {
    body.innerHTML = `<tr><td colspan="9" class="muted">ยังไม่มีกิจกรรม</td></tr>`;
    return;
  }

  body.innerHTML = tableActivities.map(a => `
    <tr>
      <td><strong>${esc(a.name)}</strong><br><span class="muted">${esc(a.activityId)}</span></td>
      <td>${esc(a.date)}</td>
      <td>${esc(benefitText(a))}</td>
      <td>${Number(a.capacity||0)}</td>
      <td>${Number(a.registered||0)}</td>
      <td><strong>${Number(a.remaining||0)}</strong></td>
      <td class="${a.status==='เปิดรับ'?'status-open':'status-closed'}">${esc(a.status)}</td>
      <td>${benefitCountsText(a)}</td>
      <td>
        <div class="admin-actions">
          <button class="btn report-btn small-btn" onclick="exportActivityExcel('${jsStr(a.activityId)}')">Excel</button>
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
  clearBenefits();
  (a.benefits || []).forEach(b => {
    const cb = [...document.querySelectorAll('input[name="benefit"]')].find(x => x.value === b.type);
    if (cb) cb.checked = true;
    const h = [...document.querySelectorAll('.benefit-hours')].find(x => x.dataset.benefit === b.type);
    if (h && b.hours) h.value = b.hours;
  });
  syncBenefitHours();
  $('status').value = a.status || 'เปิดรับ';

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

  const benefits = collectBenefits();
  if (!benefits) return;

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
    benefits: JSON.stringify(benefits),
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

function resetForm() {
  $('activityForm').reset();
  $('editActivityId').value = '';
  $('activityCode').disabled = false;
  $('formTitle').textContent = 'สร้างกิจกรรมใหม่';
  $('cancelEditBtn').classList.add('hidden');
  $('slotsContainer').innerHTML = '';
  addSlotRow();
  clearBenefits();
  syncBenefitHours();
}

async function adminPost(action, data) {
  const body = new URLSearchParams({ action, adminKey, ...data });
  const res = await fetch(API_URL, { method:'POST', body });
  return await res.json();
}

function benefitCountsText(a) {
  const counts = a.benefitCounts || {};
  const lines = (a.benefits || []).map(b => `${esc(b.hours ? `${b.type} ${b.hours} ชม.` : b.type)}: <strong>${Number(counts[b.type] || 0)}</strong>`);
  return lines.length ? lines.join('<br>') : '-';
}


window.exportActivityExcel = async function(activityId) {
  if (typeof XLSX === 'undefined') {
    showToast('ไม่สามารถโหลดระบบสร้าง Excel ได้ กรุณาตรวจสอบอินเทอร์เน็ต', true);
    return;
  }

  const activity = adminActivities.find(a => a.activityId === activityId);
  if (!activity) {
    showToast('ไม่พบกิจกรรม', true);
    return;
  }

  try {
    showToast('กำลังสร้างรายงาน Excel...');
    const data = await adminPost('adminGetRegistrations', { activityId });
    if (!data.success) throw new Error(data.message || 'ไม่สามารถดึงรายงานได้');

    const wb = XLSX.utils.book_new();
    const rows = data.registrations || [];

    const summary = [
      ['รายงานผู้ลงทะเบียนกิจกรรม'],
      ['รหัสกิจกรรม', activity.activityId],
      ['ชื่อกิจกรรม', activity.name],
      ['วันที่จัดกิจกรรม', activity.date],
      ['จำนวนที่เปิดรับ', Number(activity.capacity || 0)],
      ['ผู้ลงทะเบียนปัจจุบัน', Number(activity.registered || 0)],
      ['จำนวนคงเหลือ', Number(activity.remaining || 0)],
      ['จำนวนรายการทั้งหมดในรายงาน', rows.length],
      []
    ];

    const header = [
      'ลำดับ',
      'รหัสรายการ',
      'รหัสนักศึกษา',
      'เบอร์โทรศัพท์',
      'ช่วงเวลา',
      'สิ่งที่นักศึกษาเลือก',
      'วันเวลาลงทะเบียน',
      'สถานะ'
    ];

    const body = rows.map((r, i) => [
      i + 1,
      r.registrationId || '',
      r.studentId || '',
      r.phone || '',
      r.slotName || '',
      r.selectedBenefit || '',
      r.registeredAt || '',
      r.status || ''
    ]);

    const aoa = summary.concat([header], body);
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Column widths
    ws['!cols'] = [
      {wch:8}, {wch:28}, {wch:18}, {wch:16},
      {wch:24}, {wch:55}, {wch:24}, {wch:14}
    ];

    // Merge report title
    ws['!merges'] = [XLSX.utils.decode_range('A1:H1')];

    // Freeze table header area approximately
    ws['!freeze'] = {xSplit:0, ySplit:10};

    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(activity.name));

    // Summary by selected benefit
    const benefitCounts = {};
    rows.filter(r => r.status === 'ลงทะเบียน').forEach(r => {
      const k = r.selectedBenefit || 'ไม่ระบุ';
      benefitCounts[k] = (benefitCounts[k] || 0) + 1;
    });

    const summaryRows = [
      ['สรุปสิทธิ์ที่นักศึกษาเลือก', 'จำนวนผู้ลงทะเบียนปัจจุบัน'],
      ...Object.entries(benefitCounts).map(([k, v]) => [k, v])
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [{wch:70}, {wch:25}];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุปสิทธิ์');

    const filename = safeFilename(`รายงาน_${activity.activityId}_${activity.name}.xlsx`);
    XLSX.writeFile(wb, filename);
    showToast(`สร้างไฟล์ ${filename} แล้ว`);
  } catch (err) {
    showToast(err.message, true);
  }
};

async function exportAllRegistrationsExcel() {
  if (selectedOverviewActivityId) {
    return exportActivityExcel(selectedOverviewActivityId);
  }
  if (typeof XLSX === 'undefined') {
    showToast('ไม่สามารถโหลดระบบสร้าง Excel ได้ กรุณาตรวจสอบอินเทอร์เน็ต', true);
    return;
  }
  if (!adminActivities.length) {
    showToast('ยังไม่มีกิจกรรมสำหรับออกรายงาน', true);
    return;
  }

  const btn = $('exportAllBtn');
  btn.classList.add('exporting');
  const oldText = btn.textContent;
  btn.textContent = 'กำลังสร้าง Excel...';

  try {
    const wb = XLSX.utils.book_new();
    const overview = [
      ['รายงานผู้ลงทะเบียนกิจกรรมทั้งหมด'],
      ['วันที่ออกรายงาน', new Date().toLocaleString('th-TH')],
      [],
      ['รหัสกิจกรรม','ชื่อกิจกรรม','สถานะ','จำนวนเปิดรับ','ลงทะเบียนปัจจุบัน','คงเหลือ']
    ];

    adminActivities.forEach(a => {
      overview.push([
        a.activityId, a.name, a.status,
        Number(a.capacity || 0),
        Number(a.registered || 0),
        Number(a.remaining || 0)
      ]);
    });

    const overviewWs = XLSX.utils.aoa_to_sheet(overview);
    overviewWs['!cols'] = [
      {wch:16},{wch:45},{wch:12},{wch:16},{wch:20},{wch:14}
    ];
    XLSX.utils.book_append_sheet(wb, overviewWs, 'ภาพรวม');

    for (const activity of adminActivities) {
      const data = await adminPost('adminGetRegistrations', {activityId:activity.activityId});
      if (!data.success) continue;

      const rows = data.registrations || [];
      const aoa = [
        ['รายงานผู้ลงทะเบียนกิจกรรม'],
        ['รหัสกิจกรรม', activity.activityId],
        ['ชื่อกิจกรรม', activity.name],
        ['วันที่จัดกิจกรรม', activity.date],
        ['จำนวนที่เปิดรับ', Number(activity.capacity || 0)],
        ['ผู้ลงทะเบียนปัจจุบัน', Number(activity.registered || 0)],
        ['จำนวนคงเหลือ', Number(activity.remaining || 0)],
        [],
        ['ลำดับ','รหัสรายการ','รหัสนักศึกษา','เบอร์โทรศัพท์','ช่วงเวลา','สิ่งที่นักศึกษาเลือก','วันเวลาลงทะเบียน','สถานะ'],
        ...rows.map((r,i)=>[
          i+1,r.registrationId||'',r.studentId||'',r.phone||'',
          r.slotName||'',r.selectedBenefit||'',r.registeredAt||'',r.status||''
        ])
      ];

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [
        {wch:8},{wch:28},{wch:18},{wch:16},
        {wch:24},{wch:55},{wch:24},{wch:14}
      ];
      ws['!merges'] = [XLSX.utils.decode_range('A1:H1')];
      XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(wb, activity.activityId));
    }

    const filename = `รายงานผู้ลงทะเบียนกิจกรรมทั้งหมด_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast('ดาวน์โหลดรายงาน Excel ทั้งหมดแล้ว');
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.classList.remove('exporting');
    btn.textContent = oldText;
  }
}

function safeFilename(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 150);
}

function safeSheetName(name) {
  return String(name || 'รายงาน')
    .replace(/[\\\/?*\[\]:]/g, ' ')
    .trim()
    .slice(0, 31) || 'รายงาน';
}

function uniqueSheetName(wb, preferred) {
  const base = safeSheetName(preferred);
  const existing = new Set(wb.SheetNames);
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(safeSheetName(`${base}-${i}`))) i++;
  return safeSheetName(`${base}-${i}`);
}

function benefitText(a) {
  if (!a.benefits || !a.benefits.length) return '-';
  return a.benefits.map(b => b.hours ? `${b.type} ${b.hours} ชม.` : b.type).join(' / ');
}

function collectBenefits() {
  const checked = [...document.querySelectorAll('input[name="benefit"]:checked')];
  if (!checked.length) {
    showToast('กรุณาเลือกสิ่งที่ต้องการจากกิจกรรมอย่างน้อย 1 อย่าง', true);
    return null;
  }
  const result = [];
  for (const cb of checked) {
    const type = cb.value;
    let hours = '';
    if (type === 'ชั่วโมงทุนเครือข่าย' || type === 'ชั่วโมงทุนคนละครึ่ง') {
      const input = [...document.querySelectorAll('.benefit-hours')].find(x => x.dataset.benefit === type);
      hours = Number(input?.value || 0);
      if (hours <= 0) {
        showToast(`กรุณาระบุจำนวนชั่วโมงสำหรับ ${type}`, true);
        input?.focus();
        return null;
      }
    }
    result.push({type, hours});
  }
  return result;
}

function syncBenefitHours() {
  document.querySelectorAll('.benefit-hours').forEach(input => {
    const cb = [...document.querySelectorAll('input[name="benefit"]')].find(x => x.value === input.dataset.benefit);
    input.disabled = !cb?.checked;
    input.required = !!cb?.checked;
    if (!cb?.checked) input.value = '';
  });
}

function clearBenefits() {
  document.querySelectorAll('input[name="benefit"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('.benefit-hours').forEach(i => { i.value=''; i.disabled=true; i.required=false; });
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
