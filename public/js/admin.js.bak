let adminUser, activeView = "overview";
const adminContent = $("#adminContent");
const titles = {overview:"نظرة عامة",lessons:"إدارة الدروس",homework:"إدارة الواجبات",exams:"إدارة الامتحانات",students:"الطلاب",results:"النتائج والتسليمات",notifications:"الإشعارات",settings:"الإعدادات"};
function navTo(view) {
  activeView=view;
  $$("#adminNav .nav-link").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  $("#pageTitle").textContent=titles[view];
  $(".sidebar")?.classList.remove("open");
  renderAdminView(view).catch(e=>{adminContent.innerHTML=emptyState(e.message);});
}
$$("#adminNav .nav-link").forEach(b=>b.addEventListener("click",()=>navTo(b.dataset.view)));
function pageHead(title,sub,action=""){return `<div class="page-heading"><div><span class="eyebrow-dark">منصة مستر أحمد</span><h1>${title}</h1><p>${sub}</p></div>${action}</div>`;}
async function renderAdminView(view){
  adminContent.innerHTML='<div class="loading-state">جارٍ تحميل البيانات...</div>';
  if(view==="overview"){
    const d=await API.get("/api/admin/overview"),s=d.stats;
    adminContent.innerHTML=pageHead("صباح الخير، "+escapeHTML(adminUser.name.split(" ")[0])+".","هذه صورة واضحة لما يحدث داخل منصتك اليوم.")+
    `<div class="stats-grid">
      ${stat("إجمالي الطلاب",s.students,"حساب طالب مسجل")}
      ${stat("الدروس",s.lessons,`${s.publishedLessons} درس منشور`)}
      ${stat("الواجبات",s.homework,"واجب تم إنشاؤه")}
      ${stat("الامتحانات",s.exams,`${s.attempts} محاولة مسجلة`)}
    </div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h3>أحدث الطلاب</h3><p>آخر الحسابات التي انضمت للمنصة</p></div><button class="btn btn-secondary btn-small" data-admin-go="students">إدارة الطلاب</button></div>
    ${d.recentStudents.length?`<div class="data-list">${d.recentStudents.map(u=>`<div class="data-row"><div><b>${escapeHTML(u.name)}</b><small>${escapeHTML(u.email)} · ${escapeHTML(u.grade)}</small></div><small>${dateLabel(u.created_at)}</small></div>`).join("")}</div>`:emptyState("لم ينضم طلاب بعد.")}</section>
    <section class="panel"><div class="panel-head"><div><h3>اختصارات سريعة</h3><p>أنشئ محتوى جديداً للطلاب</p></div></div><div class="data-list">
    ${quick("إضافة درس","انشر شرحاً جديداً للطلاب","lessons")}${quick("إضافة واجب","حدد المطلوب وموعد التسليم","homework")}${quick("إنشاء امتحان","أضف أسئلة واختبر الطلاب","exams")}${quick("إرسال إشعار","شارك تنبيهاً مع الطلاب","notifications")}</div></section></div>`;
    $$("[data-admin-go]").forEach(b=>b.addEventListener("click",()=>navTo(b.dataset.adminGo)));
    $$("[data-quick]").forEach(b=>b.addEventListener("click",()=>navTo(b.dataset.quick)));
  } else if(["lessons","homework","exams"].includes(view)){
    const cfg={
      lessons:{endpoint:"lessons",title:"الدروس",sub:"أضف الشروحات والمواد التعليمية، وتحكم في ظهورها للطلاب.",button:"إضافة درس",cols:["العنوان","المادة","الصف","الحالة"],fields:["title","description","subject","grade","video_url","material_url","thumbnail_url","status"]},
      homework:{endpoint:"homework",title:"الواجبات",sub:"حدد المطلوب من الطلاب وتابع التسليمات.",button:"إضافة واجب",cols:["الواجب","المادة","الصف","موعد التسليم","الحالة"],fields:["title","description","subject","grade","due_date","attachment_url","status"]},
      exams:{endpoint:"exams",title:"الامتحانات",sub:"أنشئ امتحانات اختيار من متعدد وصحّحها تلقائياً.",button:"إنشاء امتحان",cols:["الامتحان","المادة","الصف","الأسئلة","الحالة"],fields:["title","description","subject","grade","duration","total_marks","pass_marks","start_at","end_at","status","questions"]}}
    const c=cfg[view],rows=await API.get(`/api/admin/${c.endpoint}`);
    adminContent.innerHTML=pageHead(c.title,c.sub,`<button class="btn btn-primary" id="addRecord">${c.button} +</button>`)+
    `<section class="panel"><div class="toolbar"><input class="search-input" id="recordSearch" placeholder="ابحث بالعنوان أو المادة..."><span class="muted small">${rows.length} سجل</span></div>
    ${rows.length?`<div class="table-wrap"><table class="data-table"><thead><tr>${c.cols.map(x=>`<th>${x}</th>`).join("")}<th>إجراءات</th></tr></thead><tbody>${rows.map(r=>recordRow(view,r)).join("")}</tbody></table></div>`:emptyState("لا يوجد محتوى بعد. ابدأ بإضافة أول عنصر.")}</section>`;
    $("#addRecord").addEventListener("click",()=>openRecordModal(view,null));
    $("#recordSearch").addEventListener("input",e=>$$("tbody tr").forEach(tr=>tr.hidden=!tr.textContent.toLowerCase().includes(e.target.value.toLowerCase())));
    $$("[data-edit]").forEach(b=>b.addEventListener("click",()=>openRecordModal(view,rows.find(x=>x.id===Number(b.dataset.edit)))));
    $$("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteRecord(view,b.dataset.delete)));
  } else if(view==="students"){
    const rows=await API.get("/api/admin/students");
    adminContent.innerHTML=pageHead("الطلاب","تابع الحسابات، الصفوف الدراسية، ونشاط الطلاب.")+
    `<section class="panel"><div class="toolbar"><input class="search-input" id="studentSearch" placeholder="ابحث بالاسم أو البريد الإلكتروني..."><span class="muted small">${rows.length} طالب</span></div>
    ${rows.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>الطالب</th><th>الصف</th><th>الامتحانات</th><th>الواجبات</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>${rows.map(u=>`<tr><td><div class="table-title">${escapeHTML(u.name)}</div><div class="table-sub">${escapeHTML(u.email)}</div></td><td>${escapeHTML(u.grade)}</td><td>${u.exams_taken}</td><td>${u.homework_submitted}</td><td>${statusPill(u.status)}</td><td><button class="icon-action" data-toggle-student="${u.id}" data-status="${u.status}">${u.status==="active"?"إيقاف الحساب":"تفعيل الحساب"}</button></td></tr>`).join("")}</tbody></table></div>`:emptyState("لا يوجد طلاب مسجلون حتى الآن.")}</section>`;
    $("#studentSearch").addEventListener("input",e=>$$("tbody tr").forEach(tr=>tr.hidden=!tr.textContent.toLowerCase().includes(e.target.value.toLowerCase())));
    $$("[data-toggle-student]").forEach(b=>b.addEventListener("click",async()=>{try{await API.patch(`/api/admin/students/${b.dataset.toggleStudent}`,{status:b.dataset.status==="active"?"inactive":"active"});toast("تم تحديث حالة الحساب.");navTo("students");}catch(e){toast(e.message);}}));
  } else if(view==="results"){
    const [results,subs]=await Promise.all([API.get("/api/admin/results"),API.get("/api/admin/submissions")]);
    adminContent.innerHTML=pageHead("النتائج والتسليمات","راجع درجات الامتحانات وإجابات الواجبات المرسلة.")+
    `<section class="panel"><div class="panel-head"><h3>نتائج الامتحانات</h3><span class="pill">${results.length} نتيجة</span></div>${results.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>الطالب</th><th>الامتحان</th><th>المادة</th><th>الدرجة</th><th>التاريخ</th></tr></thead><tbody>${results.map(r=>`<tr><td>${escapeHTML(r.student_name)}<div class="table-sub">${escapeHTML(r.email)}</div></td><td>${escapeHTML(r.exam_title)}</td><td>${escapeHTML(r.subject)}</td><td><b>${r.score}/${r.total_marks}</b></td><td>${dateLabel(r.submitted_at)}</td></tr>`).join("")}</tbody></table></div>`:emptyState("لم يسجل الطلاب نتائج بعد.")}</section>
    <section class="panel"><div class="panel-head"><h3>تسليمات الواجبات</h3><span class="pill">${subs.length} تسليم</span></div>${subs.length?`<div class="data-list">${subs.map(s=>`<div class="data-row"><div><b>${escapeHTML(s.homework_title)} — ${escapeHTML(s.student_name)}</b><small>${escapeHTML(s.subject)} · ${dateLabel(s.submitted_at)}</small><p class="small muted">${escapeHTML(s.answer)}</p></div></div>`).join("")}</div>`:emptyState("لا توجد تسليمات حتى الآن.")}</section>`;
  } else if(view==="notifications"){
    const rows=await API.get("/api/admin/notifications");
    adminContent.innerHTML=pageHead("الإشعارات","أرسل رسالة واضحة للطلاب المسجلين في المنصة.",'<button class="btn btn-primary" id="addNotice">إرسال إشعار +</button>')+
    `${rows.length?rows.map(n=>`<article class="notice-card"><div class="card-foot"><h3>${escapeHTML(n.title)}</h3><button class="icon-action" data-remove-notice="${n.id}">حذف</button></div><p>${escapeHTML(n.body)}</p><small class="muted">${dateLabel(n.created_at)}</small></article>`).join(""):emptyState("لم يتم إرسال إشعارات بعد.")}`;
    $("#addNotice").addEventListener("click",openNoticeModal);
    $$("[data-remove-notice]").forEach(b=>b.addEventListener("click",async()=>{if(!confirm("حذف هذا الإشعار؟"))return;await API.delete(`/api/admin/notifications/${b.dataset.removeNotice}`);toast("تم حذف الإشعار.");navTo("notifications");}));
  } else if(view==="settings"){
    const s=await API.get("/api/admin/settings");
    adminContent.innerHTML=pageHead("إعدادات المنصة","عدّل بيانات المنصة التي تظهر في مساحة العمل.")+
    `<section class="panel"><form id="settingsForm" class="form-grid">
    ${field("اسم المنصة","platform_name",s.platform_name||"منصة مستر أحمد")}
    ${field("اسم المدرّس","teacher_name",s.teacher_name||adminUser.name)}
    ${field("بريد التواصل","support_email",s.support_email||"","email")}
    ${field("إعلان للطلاب","announcement",s.announcement||"","textarea",true)}
    <div class="field full"><button class="btn btn-primary" type="submit">حفظ الإعدادات</button></div></form></section>`;
    $("#settingsForm").addEventListener("submit",async e=>{e.preventDefault();try{await API.put("/api/admin/settings",Object.fromEntries(new FormData(e.currentTarget)));toast("تم حفظ الإعدادات.");}catch(err){toast(err.message);}});
  }
}
function stat(label,value,note){return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`;}
function quick(title,sub,view){return `<button class="data-row" data-quick="${view}" style="width:100%;text-align:right;background:none;border:0"><div><b>${title}</b><small>${sub}</small></div><span class="muted">←</span></button>`;}
function recordRow(view,r){
  let cells=view==="lessons"?[r.title,r.subject,r.grade,statusPill(r.status)]:view==="homework"?[r.title,r.subject,r.grade,dateLabel(r.due_date),statusPill(r.status)]:[r.title,r.subject,r.grade,parseQuestions(r).length,statusPill(r.status)];
  return `<tr>${cells.map((x,i)=>`<td>${i===0?`<div class="table-title">${escapeHTML(x)}</div>`:x}</td>`).join("")}<td><div class="row-actions"><button class="icon-action" data-edit="${r.id}">تعديل</button><button class="icon-action" data-delete="${r.id}">حذف</button></div></td></tr>`;
}
function parseQuestions(r){return r.questions || (()=>{try{return JSON.parse(r.questions_json||"[]")}catch{return []}})();}
function openRecordModal(view,r){
  const edit=!!r, isExam=view==="exams";
  const title=({lessons:"درس",homework:"واجب",exams:"امتحان"})[view];
  let html=`<div class="modal-head"><div><span class="eyebrow-dark">${edit?"تعديل":"إضافة"} ${title}</span><h2>${edit?"تعديل":"إنشاء"} ${title}</h2></div><button class="modal-close" id="closeModal">✕</button></div>
  <form id="recordForm"><div class="form-grid">
  ${field("العنوان","title",r?.title||"","text",true)}
  ${field("الوصف","description",r?.description||"","textarea",true)}
  ${field("المادة","subject",r?.subject||"")}
  ${field("الصف الدراسي","grade",r?.grade||"الصف الأول الثانوي")}
  ${view==="lessons"?field("رابط الفيديو","video_url",r?.video_url||"","url",true)+field("رابط ملف الشرح","material_url",r?.material_url||"","url",true)+field("رابط صورة الغلاف","thumbnail_url",r?.thumbnail_url||"","url",true):""}
  ${view==="homework"?field("آخر موعد للتسليم","due_date",r?.due_date||"","date")+field("رابط المرفق","attachment_url",r?.attachment_url||"","url",true):""}
  ${isExam?field("مدة الامتحان بالدقائق","duration",r?.duration||30,"number")+field("الدرجة الكلية","total_marks",r?.total_marks||10,"number")+field("درجة النجاح","pass_marks",r?.pass_marks||5,"number")+field("وقت البداية","start_at",r?.start_at||"","datetime-local")+field("وقت النهاية","end_at",r?.end_at||"","datetime-local"):""}
  ${selectField("الحالة","status",r?.status||"draft",isExam?[{value:"draft",label:"مسودة"},{value:"published",label:"منشور"},{value:"active",label:"نشط"},{value:"completed",label:"مكتمل"}]:[{value:"draft",label:"مسودة"},{value:"published",label:"منشور"}])}
  ${isExam?`<div class="field full"><label>أسئلة الاختيار من متعدد</label><div id="questionsEditor"></div><button type="button" class="btn btn-secondary btn-small" id="addQuestion">إضافة سؤال</button><input type="hidden" name="questions" id="questionsJson"></div>`:""}
  </div><div class="modal-actions"><button type="button" class="btn btn-secondary" id="cancelModal">إلغاء</button><button class="btn btn-primary" type="submit">حفظ</button></div></form>`;
  showModal(html);
  $("#closeModal").onclick=closeModal;$("#cancelModal").onclick=closeModal;
  let questions=isExam?parseQuestions(r||{}):[];
  if(isExam){renderQuestionsEditor(questions);$("#addQuestion").onclick=()=>{questions.push({id:"q"+Date.now(),text:"",options:["","","",""],correct:0,marks:1});renderQuestionsEditor(questions);};}
  $("#recordForm").addEventListener("submit",async e=>{
    e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));
    if(isExam){data.questions=questions;data.questions_json=JSON.stringify(questions);}
    try{await API.request(`/api/admin/${view}${edit?"/"+r.id:""}`,{method:edit?"PUT":"POST",body:JSON.stringify(data)});closeModal();toast("تم حفظ البيانات بنجاح.");navTo(view);}
    catch(err){toast(err.message);}
  });
  function renderQuestionsEditor(qs){
    $("#questionsEditor").innerHTML=qs.map((q,i)=>`<div class="panel" style="padding:12px;margin:9px 0"><div class="field"><label>السؤال ${i+1}</label><input data-qtext="${i}" value="${escapeHTML(q.text)}" placeholder="اكتب السؤال"></div><div class="form-grid" style="margin-top:8px">${[0,1,2,3].map(j=>`<div class="field"><label>اختيار ${j+1}</label><input data-qoption="${i}-${j}" value="${escapeHTML(q.options?.[j]||"")}" placeholder="الإجابة"></div>`).join("")}</div><div class="form-grid" style="margin-top:8px">${selectField("الإجابة الصحيحة",`correct-${i}`,q.correct,[0,1,2,3].map(j=>({value:j,label:`اختيار ${j+1}`})))}${field("الدرجة",`marks-${i}`,q.marks||1,"number")}</div><button type="button" class="icon-action" data-remove-q="${i}">حذف السؤال</button></div>`).join("");
    $$("[data-qtext]").forEach(el=>el.oninput=()=>qs[Number(el.dataset.qtext)].text=el.value);
    $$("[data-qoption]").forEach(el=>el.oninput=()=>{const [i,j]=el.dataset.qoption.split("-").map(Number);qs[i].options[j]=el.value;});
    $$("[name^='correct-']").forEach(el=>el.onchange=()=>qs[Number(el.name.split("-")[1])].correct=Number(el.value));
    $$("[name^='marks-']").forEach(el=>el.oninput=()=>qs[Number(el.name.split("-")[1])].marks=Number(el.value));
    $$("[data-remove-q]").forEach(el=>el.onclick=()=>{qs.splice(Number(el.dataset.removeQ),1);renderQuestionsEditor(qs);});
  }
}
function showModal(html){$("#modalCard").innerHTML=html;$("#modalBackdrop").classList.remove("hidden");}
function closeModal(){$("#modalBackdrop").classList.add("hidden");}
$("#modalBackdrop").addEventListener("click",e=>{if(e.target.id==="modalBackdrop")closeModal();});
async function deleteRecord(view,id){if(!confirm("هل أنت متأكد من حذف هذا العنصر؟"))return;try{await API.delete(`/api/admin/${view}/${id}`);toast("تم الحذف.");navTo(view);}catch(e){toast(e.message);}}
function openNoticeModal(){
  showModal(`<div class="modal-head"><h2>إرسال إشعار جديد</h2><button class="modal-close" id="closeModal">✕</button></div><form id="noticeForm" class="form-grid">
  ${field("عنوان الإشعار","title","","text",true)}${field("نص الرسالة","body","","textarea",true)}
  ${selectField("المستلمون","audience","students",[{value:"students",label:"الطلاب"},{value:"all",label:"الجميع"}],true)}
  <div class="field full"><div class="modal-actions"><button type="button" class="btn btn-secondary" id="cancelModal">إلغاء</button><button class="btn btn-primary">إرسال الإشعار</button></div></div></form>`);
  $("#closeModal").onclick=closeModal;$("#cancelModal").onclick=closeModal;
  $("#noticeForm").onsubmit=async e=>{e.preventDefault();try{await API.post("/api/admin/notifications",Object.fromEntries(new FormData(e.currentTarget)));closeModal();toast("تم إرسال الإشعار.");navTo("notifications");}catch(err){toast(err.message);}};
}
(async()=>{adminUser=await requireRole("admin");if(!adminUser)return;$("#adminName").textContent=adminUser.name;navTo("overview");})();
