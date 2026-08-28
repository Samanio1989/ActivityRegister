let activities = [];

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  loadActivities();
});

function bindEvents() {
  $('refreshBtn').addEventListener('click', loadActivities);
  $('openCancelBtn').addEventListener('click', openCancelModal);
  $('registerForm').addEventListener('submit', submitRegistration);
  $('cancelForm').addEventListener('submit', submitCancellation);

  document.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', () => closeModal(el.dataset.close));
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal('registerModal');
      closeModal('cancelModal');
    }
  });
}

function apiReady() {
  return API_URL && !API_URL.includes('PUT_YOUR_');
}

async function loadActivities() {
  if (!apiReady()) {
    showAlert('กรุณาใส่ Apps Script Web App URL ในไฟล์ js/config.js ก่อนใช้งาน');
    renderActivities([]);
    return;
  }

  setLoading(true);
  hideAlert();

  try {
    const res = await fetch(`${API_URL}?action=listActivities&_=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store'
    });
    const data = await res.json();

    if (!data.success) throw new Error(data.message || 'โหลดข้อมูลไม่สำเร็จ');

    activities = data.activities || [];
    renderActivities(activities);
    fillCancelActivities();
  } catch (err) {
    showAlert('ไม่สามารถโหลดกิจกรรมได้: ' + err.message);
    renderActivities([]);
  } finally {
    setLoading(false);
  }
}

function renderActivities(items) {
  const grid = $('activityGrid');
  const empty = $('emptyState');

  if (!items.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    $('summaryText').textContent = 'ไม่พบกิจกรรมที่เปิดรับ';
    return;
  }

  empty.classList.add('hidden');
  $('summaryText').textContent = `เปิดรับอยู่ ${items.length} กิจกรรม`;

  grid.innerHTML = items.map(a => {
    const capacity = Number(a.capacity || 0);
    const registered = Number(a.registered || 0);
    const remaining = Number(a.remaining || 0);
    const pct = capacity > 0 ? Math.min(100, Math.round((registered / capacity) * 100)) : 0;

    let remainingClass = 'remaining-ok';
    if (remaining === 0) remainingClass = 'remaining-full';
    else if (capacity > 0 && remaining <= Math.max(3, Math.ceil(capacity * .1))) remainingClass = 'remaining-low';

    const benefit = benefitText(a);
    const timeText = [a.startTime, a.endTime].filter(Boolean).join(' - ');

    return `
      <article class="card">
        <div class="card-accent"></div>
        <div class="card-body">
          <div class="badges">
            <span class="badge">${escapeHtml(a.date || 'ไม่ระบุวันที่')}</span>
            ${benefit ? `<span class="badge badge-benefit">${escapeHtml(benefit)}</span>` : ''}
          </div>

          <h3>${escapeHtml(a.name || '')}</h3>
          <p class="desc">${escapeHtml(a.detail || 'ไม่มีรายละเอียดเพิ่มเติม')}</p>

          <div class="meta">
            ${timeText ? `<div class="meta-row"><span>🕒</span><span>${escapeHtml(timeText)}</span></div>` : ''}
            ${a.slots?.length ? `<div class="meta-row"><span>📌</span><span>${a.slots.length} ช่วงเวลาให้เลือก</span></div>` : ''}
          </div>

          <div class="capacity">
            <div class="capacity-top">
              <span>ลงทะเบียนแล้ว <strong>${registered}</strong> / ${capacity} คน</span>
              <strong class="${remainingClass}">${remaining > 0 ? `เหลือ ${remaining}` : 'เต็มแล้ว'}</strong>
            </div>
            <div class="progress"><span style="width:${pct}%"></span></div>
          </div>

          <button class="btn btn-primary"
                  ${a.isFull || remaining <= 0 ? 'disabled' : ''}
                  onclick="openRegisterModal('${jsString(a.activityId)}')">
            ${a.isFull || remaining <= 0 ? 'จำนวนเต็มแล้ว' : 'ลงทะเบียนกิจกรรม'}
          </button>
        </div>
      </article>
    `;
  }).join('');
}

function benefitText(a) {
  const requirement = String(a.requirement || '').trim();
  if (!requirement) return '';

  if (requirement === 'ชั่วโมงทุนเครือข่าย' || requirement === 'ชั่วโมงทุนคนละครึ่ง') {
    return `${requirement} ${a.hours || 0} ชม.`;
  }
  return requirement;
}

window.openRegisterModal = function(activityId) {
  const a = activities.find(x => x.activityId === activityId);
  if (!a) return;

  if (Number(a.remaining) <= 0) {
    showToast('กิจกรรมนี้เต็มแล้ว');
    return;
  }

  $('activityId').value = a.activityId;
  $('selectedActivity').innerHTML = `
    <strong>${escapeHtml(a.name)}</strong><br>
    <span class="muted">${escapeHtml(a.date || '')} · เหลือ ${Number(a.remaining)} ที่</span>
  `;

  const wrap = $('slotWrap');
  const select = $('slotId');

  if (a.slots && a.slots.length) {
    wrap.classList.remove('hidden');
    select.required = true;
    select.innerHTML = `<option value="">-- เลือกช่วงเวลา --</option>` +
      a.slots.map(s => `<option value="${escapeAttr(s.slotId)}">${escapeHtml(slotLabel(s))}</option>`).join('');
  } else {
    wrap.classList.add('hidden');
    select.required = false;
    select.innerHTML = '';
  }

  $('registerForm').reset();
  $('activityId').value = a.activityId;
  openModal('registerModal');
};

async function submitRegistration(e) {
  e.preventDefault();

  const btn = $('submitRegisterBtn');
  setButtonLoading(btn, true, 'กำลังบันทึก...');

  const body = new URLSearchParams({
    action: 'register',
    activityId: $('activityId').value.trim(),
    studentId: $('studentId').value.trim(),
    phone: $('phone').value.trim(),
    slotId: $('slotId').value || ''
  });

  try {
    const res = await fetch(API_URL, { method: 'POST', body });
    const data = await res.json();

    if (!data.success) throw new Error(data.message || 'ลงทะเบียนไม่สำเร็จ');

    closeModal('registerModal');
    showToast(`ลงทะเบียนสำเร็จ · คงเหลือ ${data.remaining} ที่`);
    $('registerForm').reset();
    await loadActivities();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    setButtonLoading(btn, false);
  }
}

function openCancelModal() {
  fillCancelActivities();
  $('cancelForm').reset();
  openModal('cancelModal');
}

function fillCancelActivities() {
  const select = $('cancelActivityId');
  const current = select.value;
  select.innerHTML = `<option value="">-- เลือกกิจกรรม --</option>` +
    activities.map(a => `<option value="${escapeAttr(a.activityId)}">${escapeHtml(a.name)}</option>`).join('');
  if (activities.some(a => a.activityId === current)) select.value = current;
}

async function submitCancellation(e) {
  e.preventDefault();

  const btn = $('submitCancelBtn');
  setButtonLoading(btn, true, 'กำลังยกเลิก...');

  const body = new URLSearchParams({
    action: 'unregister',
    activityId: $('cancelActivityId').value,
    studentId: $('cancelStudentId').value.trim(),
    phone: $('cancelPhone').value.trim()
  });

  try {
    const res = await fetch(API_URL, { method: 'POST', body });
    const data = await res.json();

    if (!data.success) throw new Error(data.message || 'ยกเลิกไม่สำเร็จ');

    closeModal('cancelModal');
    showToast(`ยกเลิกสำเร็จ · ขณะนี้เหลือ ${data.remaining} ที่`);
    $('cancelForm').reset();
    await loadActivities();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    setButtonLoading(btn, false);
  }
}

function slotLabel(s) {
  const time = [s.startTime, s.endTime].filter(Boolean).join(' - ');
  return time ? `${s.name} (${time})` : s.name;
}

function setLoading(on) {
  const grid = $('activityGrid');
  if (on) {
    $('emptyState').classList.add('hidden');
    $('summaryText').textContent = 'กำลังโหลดข้อมูล...';
    grid.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
  }
}

function openModal(id) {
  const modal = $(id);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const modal = $(id);
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function showAlert(message) {
  const box = $('alertBox');
  box.textContent = message;
  box.classList.remove('hidden');
}

function hideAlert() {
  $('alertBox').classList.add('hidden');
}

function showToast(message, isError = false) {
  const toast = $('toast');
  toast.textContent = message;
  toast.style.background = isError ? '#b3261e' : '#202124';
  toast.classList.remove('hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.add('hidden'), 3600);
}

function setButtonLoading(btn, loading, text='') {
  if (loading) {
    btn.dataset.oldText = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.oldText || btn.textContent;
    btn.disabled = false;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function jsString(value) {
  return String(value ?? '').replaceAll('\\','\\\\').replaceAll("'","\\'");
}
