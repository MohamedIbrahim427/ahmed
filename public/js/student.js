let studentUser, currentExam = null;
const studentContent = $("#studentContent");
const studentViews = {
  overview: "الرئيسية", lessons: "الدروس", homework: "الواجبات",
  exams: "الامتحانات", results: "النتائج", notifications: "الإشعارات"
};
function setStudentView(view) {
  $$(".nav-link").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $("#pageTitle").textContent = studentViews[view] || "الرئيسية";
  $(".sidebar")?.classList.remove("open");
  renderStudentView(view).catch(err => { studentContent.innerHTML = emptyState(err.message); });
}
$$(".nav-link").forEach(b => b.addEventListener("click", () => setStudentView(b.dataset.view)));
async function renderStudentView(view) {
  studentContent.innerHTML = `<div class="loading-state">جارٍ التحميل...</div>`;
  if (view === "overview") {
    const [overview, notices] = await Promise.all([API.get("/api/student/overview"), API.get("/api/student/notifications")]);
    studentContent.innerHTML = `
      <div class="page-heading"><div><span class="eyebrow-dark">مساحة تعلّمك</span><h1>أهلاً ${escapeHTML(studentUser.name.split(" ")[0])}، نكمل من هنا.</h1><p>هذه نظرة سريعة على محتواك الدراسي وما ينتظرك.</p></div></div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">الدروس المتاحة</div><div class="stat-value">${overview.lessons}</div><div class="stat-note">محتوى الصف الدراسي</div></div>
        <div class="stat-card"><div class="stat-label">الواجبات</div><div class="stat-value">${overview.homework}</div><div class="stat-note">تابع المطلوب منك</div></div>
        <div class="stat-card"><div class="stat-label">الامتحانات</div><div class="stat-value">${overview.exams}</div><div class="stat-note">اختبر فهمك</div></div>
        <div class="stat-card"><div class="stat-label">محاولات مكتملة</div><div class="stat-value">${overview.results.length}</div><div class="stat-note">آخر نتائجك</div></div>
      </div>
      <div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h3>آخر النتائج</h3><p>ملخص آخر محاولاتك</p></div><button class="btn btn-secondary btn-small" data-go="results">كل النتائج</button></div>
      ${overview.results.length ? `<div class="data-list">${overview.results.map(r=>`<div class="data-row"><div><b>${escapeHTML(r.title)}</b><small>${escapeHTML(r.subject)} · ${dateLabel(r.submitted_at)}</small></div><span class="result-score">${r.score}/${r.total_marks}</span></div>`).join("")}</div>` : emptyState("لم تدخل أي امتحان حتى الآن.")}</section>
      <section class="panel"><div class="panel-head"><div><h3>آخر الإشعارات</h3><p>تحديثات من المدرّس</p></div></div>
      ${notices.length ? notices.slice(0,4).map(n=>`<div class="data-row"><div><b>${escapeHTML(n.title)}</b><small>${escapeHTML(n.body)}</small></div></div>`).join("") : emptyState("لا توجد إشعارات جديدة.")}</section></div>`;
    $$("[data-go]").forEach(b=>b.addEventListener("click",()=>setStudentView(b.dataset.go)));
  } else if (view === "lessons") {
    const lessons = await API.get("/api/student/lessons");
    studentContent.innerHTML = `<div class="page-heading"><div><h1>الدروس التعليمية</h1><p>كل الشروحات المنشورة والمخصصة لصفك الدراسي.</p></div><span class="pill">${lessons.length} درس</span></div>
    ${lessons.length ? `<div class="lesson-grid">${lessons.map(l=>`<article class="lesson-card"><div class="lesson-cover">درس <span style="margin-right:auto">شرح تعليمي</span></div><div class="lesson-content"><h3>${escapeHTML(l.title)}</h3><p>${escapeHTML(l.description || "شرح تعليمي من مستر أحمد.")}</p><div class="lesson-meta">${escapeHTML(l.grade)} · ${dateLabel(l.created_at)}</div><div class="card-actions">${l.video_url?`<a class="btn btn-primary btn-small" href="${escapeHTML(l.video_url)}" target="_blank" rel="noopener">مشاهدة الشرح ↗</a>`:""}${l.material_url?`<a class="btn btn-secondary btn-small" href="${escapeHTML(l.material_url)}" target="_blank" rel="noopener">فتح / تنزيل PDF ↗</a>`:""}</div></div></article>`).join("")}</div>`:emptyState("لم يتم نشر دروس لصفك حتى الآن.")}`;
  } else if (view === "homework") {
    const items = await API.get("/api/student/homework");
    studentContent.innerHTML = `<div class="page-heading"><div><h1>الواجبات</h1><p>اقرأ المطلوب، واكتب إجابتك، ثم أرسلها للمدرّس.</p></div></div>
    ${items.length ? items.map(h=>`<article class="assignment-card"><div class="card-foot"><span class="pill">واجب</span>${h.submission_id?'<span class="pill published">تم التسليم</span>':'<span class="pill draft">لم يتم التسليم</span>'}</div><h3>${escapeHTML(h.title)}</h3><p>${escapeHTML(h.description)}</p><div class="card-foot"><small class="muted">آخر موعد: ${dateLabel(h.due_date)}</small><div class="card-actions">${h.attachment_url?`<a class="btn btn-secondary btn-small" href="${escapeHTML(h.attachment_url)}" target="_blank" rel="noopener">فتح / تنزيل PDF ↗</a>`:""}<button class="btn btn-primary btn-small" data-submit-homework="${h.id}" data-answer="${escapeHTML(h.answer || "")}">${h.submission_id?"تعديل الإجابة":"إرسال الإجابة"}</button></div></div></article>`).join(""):emptyState("لا توجد واجبات منشورة حالياً.")}`;
    $$("[data-submit-homework]").forEach(b=>b.addEventListener("click",()=>homeworkModal(b.dataset.submitHomework,b.dataset.answer)));
  } else if (view === "exams") {
    const exams = await API.get("/api/student/exams");
    studentContent.innerHTML = `<div class="page-heading"><div><h1>الامتحانات</h1><p>اختبر مستواك في الامتحانات المتاحة.</p></div></div>
    ${exams.length ? exams.map(e=>`<article class="exam-card"><div class="card-foot"><span class="pill">${escapeHTML(e.subject)}</span>${e.attempted?'<span class="pill completed">تم التسليم</span>':statusPill(e.status)}</div><h3>${escapeHTML(e.title)}</h3><p>${escapeHTML(e.description || "اقرأ الأسئلة بعناية قبل الإرسال.")}</p><div class="card-foot"><small class="muted">${e.duration} دقيقة · ${e.total_marks} درجة</small>${e.attempted?'<span class="muted small">تم تسجيل محاولتك</span>':`<button class="btn btn-primary btn-small" data-start-exam="${e.id}">بدء الامتحان</button>`}</div></article>`).join(""):emptyState("لا توجد امتحانات متاحة لصفك الآن.")}`;
    $$("[data-start-exam]").forEach(b=>b.addEventListener("click",()=>startExam(b.dataset.startExam)));
  } else if (view === "results") {
    const rows = await API.get("/api/student/results");
    studentContent.innerHTML = `<div class="page-heading"><div><h1>نتائجي</h1><p>سجل محاولاتك ودرجاتك المسجلة.</p></div></div>
    ${rows.length?`<section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>الامتحان</th><th>المادة</th><th>الدرجة</th><th>التاريخ</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="table-title">${escapeHTML(r.title)}</td><td>${escapeHTML(r.subject)}</td><td><b>${r.score} / ${r.total_marks}</b></td><td>${dateLabel(r.submitted_at)}</td></tr>`).join("")}</tbody></table></div></section>`:emptyState("ستظهر نتائجك هنا بعد أداء الامتحانات.")}`;
  } else if (view === "notifications") {
    const rows = await API.get("/api/student/notifications");
    studentContent.innerHTML = `<div class="page-heading"><div><h1>الإشعارات</h1><p>آخر الرسائل والتنبيهات من المدرّس.</p></div></div>
    ${rows.length?rows.map(n=>`<article class="notice-card"><div class="card-foot"><h3>${escapeHTML(n.title)}</h3><small class="muted">${dateLabel(n.created_at)}</small></div><p>${escapeHTML(n.body)}</p></article>`).join(""):emptyState("لا توجد إشعارات حالياً.")}`;
  }
}
function homeworkModal(id, oldAnswer) {
  const answer = prompt("اكتب إجابتك أو ملاحظاتك:", oldAnswer || "");
  if (answer === null) return;
  API.post(`/api/student/homework/${id}/submit`, {answer}).then(r=>{toast(r.message);setStudentView("homework");}).catch(e=>toast(e.message));
}
async function startExam(id) {
  try {
    currentExam = await API.get(`/api/student/exams/${id}`);
    const html = `<div class="page-heading"><div><h1>${escapeHTML(currentExam.title)}</h1><p>${escapeHTML(currentExam.description)} · ${currentExam.duration} دقيقة</p></div><button class="btn btn-secondary btn-small" id="cancelExam">رجوع</button></div>
      <form id="examAttempt" class="panel">${currentExam.questions.map((q,i)=>`<div class="exam-question"><h4>${i+1}. ${escapeHTML(q.text)} <small class="muted">(${q.marks||1} درجة)</small></h4>${(q.options||[]).map((op,j)=>`<label class="option-line"><input type="radio" name="${escapeHTML(q.id)}" value="${j}" required>${escapeHTML(op)}</label>`).join("")}</div>`).join("")}
      <div class="modal-actions"><button class="btn btn-primary" type="submit">إرسال الإجابات</button></div></form>`;
    studentContent.innerHTML = html;
    $("#cancelExam").addEventListener("click",()=>setStudentView("exams"));
    $("#examAttempt").addEventListener("submit",async e=>{
      e.preventDefault();
      if(!confirm("هل تريد إرسال إجاباتك؟ لن تتمكن من إعادة المحاولة.")) return;
      const answers = Object.fromEntries(new FormData(e.currentTarget).entries());
      try { const result=await API.post(`/api/student/exams/${id}/submit`,{answers});studentContent.innerHTML=`<section class="panel" style="text-align:center;padding:45px"><span class="eyebrow-dark">تم تسجيل إجابتك</span><h1>انتهى الامتحان</h1><div class="result-score">${result.score} / ${result.total_marks}</div><p class="muted">تم حفظ نتيجتك في حسابك.</p><button class="btn btn-primary" id="backResults">عرض النتائج</button></section>`;$("#backResults").addEventListener("click",()=>setStudentView("results"));}catch(err){toast(err.message);}
    });
  } catch(err){toast(err.message);}
}
(async()=>{
  studentUser=await requireRole("student");
  if(!studentUser)return;
  $("#studentName").textContent=studentUser.name;
  $("#studentGrade").textContent=studentUser.grade;
  $("#studentAvatar").textContent=studentUser.name.trim().charAt(0);
  setStudentView("overview");
})();
