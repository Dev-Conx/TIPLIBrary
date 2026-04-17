const DB = {
  users: [],
  sessions: [],
  tasks: [],
  goals: [],
  notes: [],
  timerLogs: [],
  subjects: {},
  settings: {},
};

let currentUser = null;
let charts = {};
let calDate = new Date();
let notifItems = [];
let darkMode = false;
let sentReminderKeys = new Set();
let overdueIntervalId = null;
let reminderIntervalId = null;
let dialogResolver = null;

let timerState = { running:false, seconds:0, interval:null, subject:'' };
let breakState = { running:false, seconds:0, total:0, interval:null };
const $ = id => document.getElementById(id);
const uid = () => Date.now() + Math.random().toString(36).slice(2,8);
const today = () => new Date().toISOString().split('T')[0];
const nowISO = () => new Date().toISOString();
const currentDateTime = () => {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`,
    time: `${z(d.getHours())}:${z(d.getMinutes())}`,
  };
};
const initials = name => name.trim().split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
const fmt = s => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60; return `${z(h)}:${z(m)}:${z(sec)}`; };
const fmtBreak = s => { const m=Math.floor(s/60),sec=s%60; return `${z(m)}:${z(sec)}`; };
const z = n => String(n).padStart(2,'0');
const getSubjects = () => (currentUser && DB.subjects[currentUser.id]) || [];
const getSubjectColor = name => { const s=getSubjects().find(s=>s.name===name); return s?s.color:'#F5C800'; };

const PALETTE = ['#3B82F6','#10B981','#EF4444','#8B5CF6','#F59E0B','#EC4899','#06B6D4','#F97316','#84CC16','#A78BFA'];
let paletteIdx = 0;
function toast(msg, type='info') {
  const icons={success:'✅',error:'❌',info:'💡',warning:'⚠️'};
  const wrap=$('toastWrap');
  const t=document.createElement('div');
  t.className=`toast ${type}`;
  t.innerHTML=`<span class="toast-icon">${icons[type]||'💡'}</span><span>${msg}</span><span class="toast-close" onclick="this.parentElement.remove()">✕</span>`;
  wrap.appendChild(t);
  setTimeout(()=>{t.style.animation='toastOut .3s ease forwards';setTimeout(()=>t.remove(),300);},3500);
}

function showAuthTab(tab) {
  ['login','register','forgot'].forEach(t=>{
    $(t+'Form').classList.toggle('hidden',t!==tab);
    $('aTab'+t.charAt(0).toUpperCase()+t.slice(1)).classList.toggle('active',t===tab);
  });
}

function doRegister() {
  const name=$('rName').value.trim();
  const email=$('rEmail').value.trim().toLowerCase();
  const pass=$('rPass').value;
  const year=$('rYear').value;
  const course=$('rCourse').value.trim();
  if(!name||!email||!pass||!course){toast('Please fill in all fields.','error');return;}
  if(pass.length<6){toast('Password must be at least 6 characters.','error');return;}
  if(DB.users.find(u=>u.email===email)){toast('Email already registered.','error');return;}
  const user={id:uid(),name,email,pass,year,course};
  DB.users.push(user);
  DB.subjects[user.id]=[];
  toast('Account created! Please sign in.','success');
  showAuthTab('login');
  $('lEmail').value=email;
}

function doLogin() {
  const email=$('lEmail').value.trim().toLowerCase();
  const pass=$('lPass').value;
  const user=DB.users.find(u=>u.email===email&&u.pass===pass);
  if(!user){toast('Invalid email or password.','error');return;}
  currentUser=user;
  transitionScreens('authScreen','appShell',initApp);
}

function doForgot() {
  const email=$('fEmail').value.trim();
  if(!email){toast('Enter your email.','error');return;}
  if(!DB.users.find(u=>u.email===email.toLowerCase())){toast('No account found for that email.','error');return;}
  toast('Password reset link sent (demo mode)','info');
  showAuthTab('login');
}

function doLogout() {
  currentUser=null;
  timerFullReset();
  breakStop();
  transitionScreens('appShell','authScreen',()=>{
    $('lEmail').value='';$('lPass').value='';
  });
}

function initApp() {
  sentReminderKeys = new Set();
  initSettingsUI();
  darkMode = !!getUserSettings().darkMode;
  document.body.classList.toggle('dark', darkMode);
  if($('darkToggleSetting'))$('darkToggleSetting').checked=darkMode;
  if($('tbDarkIcon'))$('tbDarkIcon').textContent=darkMode?'☀':'◑';
  updateUserUI();
  buildNotifs();
  showPage('dashboard');
  renderAll();
  queueTaskReminders();
  enhanceDateTimePickers();
  setTimeout(initCharts,80);
  if(overdueIntervalId)clearInterval(overdueIntervalId);
  if(reminderIntervalId)clearInterval(reminderIntervalId);
  overdueIntervalId=setInterval(checkOverdueTasks,60000);
  reminderIntervalId=setInterval(queueTaskReminders,60000);
}

function updateUserUI() {
  const n=currentUser.name;
  const av=initials(n);
  ['sbAvatar','tbAvatar'].forEach(id=>{const el=$(id);if(el)el.textContent=av;});
  $('sbName').textContent=n;
  $('sbRole').textContent=`${currentUser.year} · Student`;
  $('tbName').textContent=n;
  $('welcomeTitle').textContent=`Hello, ${n.split(' ')[0]}! 👋`;
  if($('profileAv')){$('profileAv').textContent=av;$('profileName').textContent=n;$('profileSub').textContent=`${currentUser.year} · ${currentUser.course}`;}
  if($('editName'))$('editName').value=n;
  if($('editEmail'))$('editEmail').value=currentUser.email;
  if($('editCourse'))$('editCourse').value=currentUser.course;
  if($('editYear'))$('editYear').value=currentUser.year;
}

function renderAll() {
  renderSubjectSelects();
  renderDashboard();
  renderSessions();
  renderTasks();
  renderProgress();
  renderGoals();
  renderNotes();
  renderAchievements();
  renderTimerLog();
}

function showPage(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(i=>i.classList.remove('active'));
  const pageEl=$('page-'+page);
  pageEl.classList.add('active','page-enter');
  setTimeout(()=>pageEl.classList.remove('page-enter'),280);
  const el=document.querySelector(`.sb-item[data-page="${page}"]`);
  if(el)el.classList.add('active');
  const titles={dashboard:'Dashboard',planner:'Study Planner',tasks:'Tasks',progress:'Progress Tracking',analytics:'Analytics',goals:'Goals',notes:'Notes',timer:'Study Timer',achievements:'Achievements',profile:'My Profile',settings:'Settings'};
  $('tbTitle').textContent=titles[page]||page;
  if(page==='analytics')setTimeout(initAnalyticsCharts,80);
  if(page==='timer'){renderTimerLog();setTimeout(initTimerChart,80);}
  if(page==='profile')updateUserUI();
  if(page==='progress')renderProgress();
  closeNotif();
}

function renderSubjectSelects() {
  const subs=getSubjects();
  const opts=subs.length?subs.map(s=>`<option value="${s.name}">${s.name}</option>`).join(''):'<option value="">No subjects yet — add in My Profile</option>';
  ['sessionSubject','taskSubject','noteSubject','timerSubject'].forEach(id=>{const el=$(id);if(el)el.innerHTML=opts;});
  const fOpts='<option value="">All Subjects</option>'+subs.map(s=>`<option value="${s.name}">${s.name}</option>`).join('');
  ['taskSubjectFilter','noteSubjectFilter','progressSubjectFilter'].forEach(id=>{const el=$(id);if(el)el.innerHTML=fOpts;});
  renderProfileSubjects();
}

function addSubject() {
  const name=$('newSubjectInput').value.trim();
  if(!name){toast('Enter a subject name.','error');return;}
  const subs=getSubjects();
  if(subs.find(s=>s.name===name)){toast('Subject already exists.','warning');return;}
  const color=PALETTE[paletteIdx%PALETTE.length]; paletteIdx++;
  subs.push({name,color});
  DB.subjects[currentUser.id]=subs;
  $('newSubjectInput').value='';
  renderSubjectSelects();
  toast(`"${name}" added!`,'success');
}

function removeSubject(name) {
  DB.subjects[currentUser.id]=getSubjects().filter(s=>s.name!==name);
  renderSubjectSelects();
  toast('Subject removed.','info');
}

function renderProfileSubjects() {
  ['profileSubjectTags','profileSubjectTags2'].forEach(id=>{
    const el=$(id); if(!el)return;
    const subs=getSubjects();
    el.innerHTML=subs.length
      ? subs.map(s=>`<span class="tag" style="background:${s.color}22;color:${s.color};border-color:${s.color}44">${s.name} <span style="cursor:pointer;margin-left:4px;opacity:.7" onclick="removeSubject('${s.name}')">✕</span></span>`).join('')
      : '<span style="font-size:12.5px;color:var(--text3)">No subjects added yet.</span>';
  });
}

function getTaskStatus(t) {
  if(t.done) return t.late?'late':'done';
  if(!t.deadline) return 'pending';
  const dl=new Date(`${t.deadline}T${t.deadlineTime||'23:59'}`);
  if(new Date()>dl) return 'overdue';
  return 'pending';
}

function checkOverdueTasks() {
  if(!currentUser)return;
  let changed=false;
  DB.tasks.filter(t=>t.uid===currentUser.id&&!t.done).forEach(t=>{
    if(getTaskStatus(t)==='overdue'){changed=true;}
  });
  if(changed){renderTasks();renderDashboard();}
}

function renderDashboard() {
  if(!currentUser)return;
  const uid=currentUser.id;
  const tasks=DB.tasks.filter(t=>t.uid===uid);
  const done=tasks.filter(t=>t.done).length;
  const pend=tasks.filter(t=>!t.done&&getTaskStatus(t)!=='overdue').length;
  const overdue=tasks.filter(t=>!t.done&&getTaskStatus(t)==='overdue').length;
  const todaySess=DB.sessions.filter(s=>s.uid===uid&&s.date===today());
  const totalHrs=DB.timerLogs.filter(l=>l.uid===uid).reduce((a,l)=>a+l.seconds,0);
  const streak=calcStreak();

  $('statHours').textContent=(totalHrs/3600).toFixed(1)+'h';
  $('statDone').textContent=done;
  $('statPend').textContent=pend;
  $('statMissing').textContent=overdue;
  $('statStreak').textContent=getStreakEmoji(streak)+' '+streak;
  $('todayCount').textContent=`${todaySess.length} session${todaySess.length!==1?'s':''}`;
  $('taskBadge').textContent=pend+overdue;
  $('taskBadge').style.display=(pend+overdue)>0?'':'none';

  const el=$('todaySessions');
  if(!todaySess.length){el.innerHTML='<div class="empty"><div class="empty-icon">📅</div><div class="empty-text">No sessions today</div><div class="empty-sub">Add one in Study Planner</div></div>';}
  else el.innerHTML=todaySess.map(s=>`
    <div class="item-row">
      <div class="check-circle ${s.done?'done':''}" onclick="toggleSession('${s.id}')"></div>
      <div class="item-body">
        <div class="item-title ${s.done?'done':''}">${s.subject} – ${s.topic}</div>
        <div class="item-meta"><span>🕐 ${s.time} (${s.duration}m)</span></div>
      </div>
      <span class="badge ${s.done?'badge-done':'badge-pending'}">${s.done?'Done':'Pending'}</span>
    </div>`).join('');

  const upcoming=DB.sessions.filter(s=>s.uid===uid&&s.date>today()).slice(0,3);
  $('upcomingSessions').innerHTML=upcoming.length
    ? upcoming.map(s=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="width:9px;height:9px;border-radius:50%;background:${getSubjectColor(s.subject)};flex-shrink:0"></div>
        <div style="flex:1"><div style="font-size:13px;font-weight:500;color:var(--text)">${s.subject}</div><div style="font-size:11.5px;color:var(--text2)">${s.date} · ${s.time}</div></div>
      </div>`).join('')
    : '<div class="empty"><div class="empty-text" style="color:var(--text2)">No upcoming sessions</div></div>';

  const pct=done+tasks.length>0?Math.round(done/tasks.length*100):0;
  $('dashPct').textContent=pct+'%';
  if(charts.dashDonut){charts.dashDonut.data.datasets[0].data=[done||0.001,(tasks.length-done)||0.001];charts.dashDonut.update();}
}

function calcStreak() {
  if(!currentUser)return 0;
  const uid=currentUser.id;
  const logDates=[...new Set(DB.timerLogs.filter(l=>l.uid===uid).map(l=>l.date))].sort().reverse();
  let streak=0,d=new Date();
  for(let i=0;i<logDates.length;i++){
    if(logDates[i]===d.toISOString().split('T')[0]){streak++;d.setDate(d.getDate()-1);}
    else break;
  }
  return streak;
}

function getStreakEmoji(s){
  if(s>=70)return'🔥🔥🔥🔥🔥';
  if(s>=56)return'🔥🔥🔥🔥';
  if(s>=42)return'🔥🔥🔥';
  if(s>=28)return'🔥🔥';
  if(s>=14)return'🔥';
  if(s>=7)return'🌟';
  if(s>=3)return'✨';
  return'⭐';
}

function renderSessions() {
  if(!currentUser)return;
  const uid=currentUser.id;
  let sessions=DB.sessions.filter(s=>s.uid===uid);
  sessions.sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
  const el=$('sessionsList');
  if(!sessions.length){el.innerHTML='<div class="empty"><div class="empty-icon">📅</div><div class="empty-text">No study sessions yet</div><div class="empty-sub">Click "+ Add Session" to get started</div></div>';return;}
  el.innerHTML=sessions.map(s=>`
    <div class="session-card">
      <div class="sess-dot ${s.done?'done':''}" style="border-color:${s.color||getSubjectColor(s.subject)};${s.done?'background:'+s.color:''}"></div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <div style="width:9px;height:9px;border-radius:50%;background:${s.color||getSubjectColor(s.subject)};flex-shrink:0"></div>
          <span style="font-size:14px;font-weight:700;color:var(--text);${s.done?'text-decoration:line-through;color:var(--text2)':''}">${s.subject}</span>
        </div>
        <div style="font-size:12.5px;color:var(--text2)">${s.topic}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:5px;display:flex;gap:12px">
          <span>📅 ${s.date}</span><span>🕐 ${s.time} · ${s.duration} mins</span>
        </div>
        ${s.note?`<div style="font-size:12px;color:var(--text2);font-style:italic;margin-top:6px;padding:6px 10px;background:var(--yellow-light);border-radius:6px">"${s.note}"</div>`:''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
        <span class="badge ${s.done?'badge-done':'badge-pending'}">${s.done?'Done':'Pending'}</span>
        <div style="display:flex;gap:5px">
          <button class="btn-icon btn-sm" onclick="editSession('${s.id}')">✎</button>
          <button class="btn-icon btn-sm" onclick="deleteSession('${s.id}')" style="color:var(--red)">✕</button>
          ${!s.done?`<button class="btn-icon btn-sm" onclick="toggleSession('${s.id}')" style="color:var(--green)" title="Mark done">✓</button>`:''}
        </div>
      </div>
    </div>`).join('');
}

function toggleSession(id){
  const s=DB.sessions.find(x=>x.id===id);
  if(s){s.done=!s.done;renderSessions();renderDashboard();renderProgress();updateCharts();}
}

let editSessId=null;
function openAddSession(){
  if(!getSubjects().length){toast('Add a subject first in My Profile.','warning');showPage('profile');return;}
  editSessId=null;
  const settings=getUserSettings();
  $('sessionModalTitle').textContent='Add Study Session';
  $('sessionSubject').value=getSubjects()[0]?.name||'';
  $('sessionTopic').value='';$('sessionDate').value=today();$('sessionTime').value='09:00';$('sessionDuration').value=String(settings.defaultDuration||60);$('sessionNote').value='';
  $('sessionModal').classList.add('open');
}

function editSession(id){
  const s=DB.sessions.find(x=>x.id===id);if(!s)return;
  editSessId=id;
  $('sessionModalTitle').textContent='Edit Session';
  $('sessionSubject').value=s.subject;$('sessionTopic').value=s.topic;
  $('sessionDate').value=s.date;$('sessionTime').value=s.time;
  $('sessionDuration').value=s.duration;$('sessionNote').value=s.note||'';
  $('sessionModal').classList.add('open');
}

function saveSession(){
  const subj=$('sessionSubject').value;
  if(!subj){toast('Please select a subject.','error');return;}
  const color=getSubjectColor(subj);
  const sessionDate=$('sessionDate').value||today();
  const sessionTime=$('sessionTime').value||'09:00';
  const selectedDateTime=new Date(`${sessionDate}T${sessionTime}`);
  if(!editSessId && selectedDateTime<new Date()){
    toast('⛔ You cannot set a study session in the past.','error');
    return;
  }
  const data={uid:currentUser.id,subject:subj,color,topic:$('sessionTopic').value||'Study Session',date:sessionDate,time:sessionTime,duration:parseInt($('sessionDuration').value)||60,note:$('sessionNote').value,done:false};
  if(editSessId){const i=DB.sessions.findIndex(x=>x.id===editSessId);if(i>-1){data.done=DB.sessions[i].done;DB.sessions[i]={...DB.sessions[i],...data};}}
  else{data.id=uid();DB.sessions.push(data);}
  closeModal('sessionModal');
  toast(editSessId?'Session updated!':'Session added!','success');
  editSessId=null;
  renderSessions();renderDashboard();renderCalendar();renderProgress();updateCharts();
}

async function deleteSession(id){
  const ok=await showSystemDialog({title:'Delete Session',message:'Delete this session?',confirm:true,okText:'Delete'});
  if(!ok)return;
  DB.sessions=DB.sessions.filter(x=>x.id!==id);
  renderSessions();renderDashboard();renderCalendar();renderProgress();updateCharts();
  toast('Session deleted.','info');
}

function renderCalendar(){
  if(!$('calendarGrid'))return;
  const d=calDate;
  const year=d.getFullYear(),month=d.getMonth();
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  $('calMonthLabel').textContent=`${months[month]} ${year}`;
  let html=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-head">${d}</div>`).join('');
  const first=new Date(year,month,1).getDay();
  const total=new Date(year,month+1,0).getDate();
  const prev=new Date(year,month,0).getDate();
  const t=today();
  for(let i=0;i<first;i++) html+=`<div class="cal-day other"><div style="font-size:11px">${prev-first+1+i}</div></div>`;
  for(let day=1;day<=total;day++){
    const ds=`${year}-${z(month+1)}-${z(day)}`;
    const isToday=ds===t;
    const evs=DB.sessions.filter(s=>s.uid===currentUser.id&&s.date===ds);
    html+=`<div class="cal-day${isToday?' today':''}">
      <div style="font-size:11px;font-weight:${isToday?700:400};color:var(--text)">${day}</div>
      ${evs.slice(0,3).map(s=>`<div class="cal-ev" style="background:${s.color||getSubjectColor(s.subject)};font-size:9px;color:#fff;padding:1px 4px;border-radius:3px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.subject}</div>`).join('')}
    </div>`;
  }
  const rem=(7-(first+total)%7)%7;
  for(let i=1;i<=rem;i++) html+=`<div class="cal-day other"><div style="font-size:11px">${i}</div></div>`;
  $('calendarGrid').innerHTML=html;
}

function prevMonth(){calDate=new Date(calDate.getFullYear(),calDate.getMonth()-1,1);renderCalendar();}
function nextMonth(){calDate=new Date(calDate.getFullYear(),calDate.getMonth()+1,1);renderCalendar();}
function switchPlannerView(view,el){
  document.querySelectorAll('.vtab').forEach(t=>t.classList.remove('active'));el.classList.add('active');
  $('plannerList').classList.toggle('hidden',view!=='list');
  $('plannerCal').classList.toggle('hidden',view!=='cal');
  if(view==='cal')renderCalendar();
}

let taskFilters={text:'',status:'',priority:'',subject:''};

function renderTasks(f=taskFilters){
  if(!currentUser)return;
  let tasks=DB.tasks.filter(t=>t.uid===currentUser.id);
  tasks.forEach(t=>{if(getTaskStatus(t)==='overdue')t.overdue=true;else if(!t.done)t.overdue=false;});
  if(f.text)tasks=tasks.filter(t=>t.title.toLowerCase().includes(f.text.toLowerCase())||t.subject.toLowerCase().includes(f.text.toLowerCase()));
  if(f.status==='pending')tasks=tasks.filter(t=>!t.done&&!t.overdue);
  else if(f.status==='completed')tasks=tasks.filter(t=>t.done&&!t.late);
  else if(f.status==='late')tasks=tasks.filter(t=>t.late);
  else if(f.status==='overdue')tasks=tasks.filter(t=>t.overdue&&!t.done);
  if(f.priority)tasks=tasks.filter(t=>t.priority===f.priority);
  if(f.subject)tasks=tasks.filter(t=>t.subject===f.subject);

  const el=$('tasksList');
  if(!tasks.length){
    const total=DB.tasks.filter(t=>t.uid===currentUser.id).length;
    el.innerHTML=`<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">No tasks found</div><div class="empty-sub">${total?'Try clearing filters':'Click "+ Add Task" to add one'}</div></div>`;
    return;
  }

  el.innerHTML=tasks.map(t=>{
    const status=getTaskStatus(t);
    let statusBadge='';
    if(t.done&&t.late) statusBadge='<span class="badge badge-late">Late</span>';
    else if(t.done) statusBadge='<span class="badge badge-done">Done</span>';
    else if(status==='overdue') statusBadge='<span class="badge badge-overdue">Overdue</span>';
    else statusBadge='<span class="badge badge-pending">Pending</span>';

    let priorityBadge='';
    if(t.priority==='High') priorityBadge='<span class="badge badge-high">High</span>';
    else if(t.priority==='Medium') priorityBadge='<span class="badge badge-medium-p">Medium</span>';
    else priorityBadge='<span class="badge badge-low-p">Low</span>';

    const dl=t.deadline?`${t.deadline}${t.deadlineTime?' '+t.deadlineTime:''}`:'';
    return `<div class="item-row ${status==='overdue'&&!t.done?'task-overdue':''}">
      <div class="check-circle ${t.done?'done':''}" onclick="toggleTask('${t.id}')"></div>
      <div class="item-body">
        <div class="item-title ${t.done?'done':''}">${t.title}</div>
        <div class="item-meta">
          <span style="color:var(--text2)">📚 ${t.subject}</span>
          ${dl?`<span style="color:${status==='overdue'&&!t.done?'var(--red)':'var(--text2)'}">⏰ ${dl}</span>`:''}
        </div>
      </div>
      <div class="item-actions">
        ${priorityBadge}${statusBadge}
        <button class="btn-icon btn-sm" onclick="editTask('${t.id}')">✎</button>
        <button class="btn-icon btn-sm" onclick="deleteTask('${t.id}')" style="color:var(--red)">✕</button>
      </div>
    </div>`;
  }).join('');
}

function toggleTask(id){
  const t=DB.tasks.find(x=>x.id===id);
  if(!t)return;
  if(!t.done){
    const status=getTaskStatus(t);
    t.done=true;
    t.late=(status==='overdue');
    t.overdue=false;
    toast(t.late?'Task marked done (late submission).':'Task completed! ✨',t.late?'warning':'success');
  } else {
    t.done=false;t.late=false;
    toast('Task marked pending.','info');
  }
  renderTasks();renderDashboard();renderProgress();updateCharts();
}

let editTaskId=null;
function openAddTask(){
  if(!getSubjects().length){toast('Add a subject first in My Profile.','warning');showPage('profile');return;}
  editTaskId=null;
  const settings=getUserSettings();
  const dt=currentDateTime();
  $('taskModalTitle').textContent='Add Task';
  $('taskTitle').value='';
  $('taskSubject').value=getSubjects()[0]?.name||'';
  $('taskPriority').value=settings.defaultTaskPriority||'Medium';
  $('taskDeadline').value=dt.date;
  $('taskDeadlineTime').value=dt.time;
  $('taskModal').classList.add('open');
}

function editTask(id){
  const t=DB.tasks.find(x=>x.id===id);if(!t)return;
  editTaskId=id;
  $('taskModalTitle').textContent='Edit Task';
  $('taskTitle').value=t.title;
  $('taskSubject').value=t.subject;
  $('taskPriority').value=t.priority;
  $('taskDeadline').value=t.deadline||today();
  $('taskDeadlineTime').value=t.deadlineTime||'23:59';
  $('taskModal').classList.add('open');
}

function saveTask(){
  const title=$('taskTitle').value.trim();
  if(!title){toast('Enter a task title.','error');return;}
  const deadline=$('taskDeadline').value;
  const deadlineTime=$('taskDeadlineTime').value;
  if(deadline){
    const dl=new Date(`${deadline}T${deadlineTime||'23:59'}`);
    if(!editTaskId&&dl<new Date()){
      toast('⛔ Deadline has already passed! Please choose a future date and time.','error');
      return;
    }
  }
  const data={uid:currentUser.id,title,subject:$('taskSubject').value,priority:$('taskPriority').value,deadline,deadlineTime,done:false,late:false,overdue:false};
  if(editTaskId){
    const i=DB.tasks.findIndex(x=>x.id===editTaskId);
    if(i>-1){data.done=DB.tasks[i].done;data.late=DB.tasks[i].late;DB.tasks[i]={...DB.tasks[i],...data};}
  } else {
    data.id=uid();DB.tasks.push(data);
  }
  closeModal('taskModal');
  toast(editTaskId?'Task updated!':'Task added!','success');
  editTaskId=null;
  queueTaskReminders();
  renderTasks();renderDashboard();renderProgress();updateCharts();
}

async function deleteTask(id){
  const ok=await showSystemDialog({title:'Delete Task',message:'Delete this task?',confirm:true,okText:'Delete'});
  if(!ok)return;
  DB.tasks=DB.tasks.filter(x=>x.id!==id);
  renderTasks();renderDashboard();renderProgress();updateCharts();
  toast('Task deleted.','info');
}

function clearTaskFilters(){
  taskFilters={text:'',status:'',priority:'',subject:''};
  $('taskSearch').value='';$('taskStatusFilter').value='';$('taskPriorityFilter').value='';$('taskSubjectFilter').value='';
  renderTasks();
}

function renderProgress(){
  if(!currentUser)return;
  const uid=currentUser.id;
  const subjFilter=$('progressSubjectFilter')?$('progressSubjectFilter').value:'';
  const tasks=DB.tasks.filter(t=>t.uid===uid);
  const done=tasks.filter(t=>t.done).length;
  const pend=tasks.filter(t=>!t.done).length;
  const pct=tasks.length>0?Math.round(done/tasks.length*100):0;
  $('progressPct').textContent=pct+'%';
  $('progressPendCount').textContent=`Done · Pending: ${pend}`;

  let subs=getSubjects();
  if(subjFilter) subs=subs.filter(s=>s.name===subjFilter);

  const el=$('subjectProgressList');
  if(!subs.length){el.innerHTML='<div class="empty"><div class="empty-text" style="color:var(--text2)">No subjects added yet</div></div>';}
  else {
    el.innerHTML=subs.map(s=>{
      const st=tasks.filter(t=>t.subject===s.name);
      const sd=st.filter(t=>t.done).length;
      const sp=st.length?Math.round(sd/st.length*100):0;
      return `<div class="prog-wrap">
        <div class="prog-header">
          <span class="prog-label"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${s.color};margin-right:6px"></span>${s.name}</span>
          <span class="prog-pct">${sp}%</span>
        </div>
        <div class="prog-track"><div class="prog-fill" style="width:${sp}%;background:${s.color}"></div></div>
        <div style="font-size:11px;color:var(--text2);margin-top:3px">${sd}/${st.length} tasks done</div>
      </div>`;
    }).join('');
  }

  const tel=$('topicsList');
  const sessions=DB.sessions.filter(s=>s.uid===uid&&(!subjFilter||s.subject===subjFilter));
  const logs=DB.timerLogs.filter(l=>l.uid===uid);
  if(!sessions.length){tel.innerHTML='<div class="empty"><div class="empty-text" style="color:var(--text2)">No sessions logged yet</div></div>';}
  else {
    const bySubj={};
    sessions.forEach(s=>{
      if(!bySubj[s.subject])bySubj[s.subject]={topics:new Set(),sessions:0,hours:0,color:s.color||getSubjectColor(s.subject)};
      bySubj[s.subject].topics.add(s.topic);
      bySubj[s.subject].sessions++;
    });
    logs.forEach(l=>{if(bySubj[l.subject])bySubj[l.subject].hours+=l.seconds/3600;});
    tel.innerHTML=Object.entries(bySubj).map(([subj,data])=>`
      <div style="margin-bottom:14px;padding:12px;border:1.5px solid var(--border);border-left:3px solid ${data.color};border-radius:var(--r);background:var(--card)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${subj}</div>
          <div style="font-size:11.5px;color:var(--text2)">${data.sessions} sessions · ${data.hours.toFixed(1)}h studied</div>
        </div>
        <div style="font-size:11.5px;color:var(--text2);margin-bottom:6px;font-weight:600">Topics:</div>
        <div>${[...data.topics].map(t=>`<span class="tag" style="background:${data.color}18;color:${data.color};border-color:${data.color}33">${t}</span>`).join('')}</div>
      </div>`).join('');
  }

  if(charts.progressDonut){charts.progressDonut.data.datasets[0].data=[done||0.001,pend||0.001];charts.progressDonut.update();}
  if(charts.trendChart)updateTrendChart();
}

function initAnalyticsCharts(){
  if(!currentUser)return;
  const c=chartColors();
  const uid=currentUser.id;
  const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const dayHours=days.map((_,i)=>{
    const date=new Date();date.setDate(date.getDate()-date.getDay()+1+i);
    const ds=date.toISOString().split('T')[0];
    return +(DB.timerLogs.filter(l=>l.uid===uid&&l.date===ds).reduce((a,l)=>a+l.seconds,0)/3600).toFixed(1);
  });
  if(charts.hoursBar)charts.hoursBar.destroy();
  charts.hoursBar=new Chart($('hoursBarChart'),{type:'bar',data:{labels:days,datasets:[{label:'Hours',data:dayHours,backgroundColor:'#F5C800cc',borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{color:c.text},grid:{color:c.grid}},x:{ticks:{color:c.text},grid:{display:false}}}}});

  const done=DB.tasks.filter(t=>t.uid===uid&&t.done).length;
  const pend=DB.tasks.filter(t=>t.uid===uid&&!t.done&&!t.overdue).length;
  const overdue=DB.tasks.filter(t=>t.uid===uid&&t.overdue).length;
  const late=DB.tasks.filter(t=>t.uid===uid&&t.late).length;
  if(charts.tasksPie)charts.tasksPie.destroy();
  charts.tasksPie=new Chart($('tasksPieChart'),{type:'pie',data:{labels:['Completed','Pending','Overdue','Late'],datasets:[{data:[done||0.001,pend||0.001,overdue||0.001,late||0.001],backgroundColor:['#F5C800','#D97706','#EF4444','#8B5CF6'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:c.text,padding:10,font:{size:11}}}}}});

  const weekLabels=['Week 1','Week 2','Week 3','Week 4'];
  const weekData=weekLabels.map((_,wi)=>{
    let total=0;
    for(let d=0;d<7;d++){const date=new Date();date.setDate(date.getDate()-((3-wi)*7)-d);total+=DB.timerLogs.filter(l=>l.uid===uid&&l.date===date.toISOString().split('T')[0]).reduce((a,l)=>a+l.seconds,0);}
    return +(total/3600).toFixed(1);
  });

  const plannedData=weekLabels.map((_,wi)=>{
    let total=0;
    for(let d=0;d<7;d++){
      const date=new Date();date.setDate(date.getDate()-((3-wi)*7)-d);
      const ds=date.toISOString().split('T')[0];
      total+=DB.sessions.filter(s=>s.uid===uid&&s.date===ds).reduce((a,s)=>a+s.duration,0);
    }
    return +(total/60).toFixed(1);
  });

  if(charts.weeklyCompare)charts.weeklyCompare.destroy();
  charts.weeklyCompare=new Chart($('weeklyCompareChart'),{type:'bar',data:{labels:weekLabels,datasets:[
    {label:'Actual (hrs)',data:weekData,backgroundColor:'#F5C800cc',borderRadius:6},
    {label:'Planned (hrs)',data:plannedData,backgroundColor:'rgba(59,130,246,.5)',borderRadius:6}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:c.text}}},scales:{y:{beginAtZero:true,ticks:{color:c.text},grid:{color:c.grid}},x:{ticks:{color:c.text},grid:{display:false}}}}});
}

function renderGoals(){
  if(!currentUser)return;
  const uid=currentUser.id;
  ['daily','weekly'].forEach(type=>{
    const goals=DB.goals.filter(g=>g.uid===uid&&g.type===type);
    const el=$(type+'GoalsList');
    el.innerHTML=goals.length
      ? goals.map(g=>`<div class="goal-row">
          <div class="check-circle ${g.done?'done':''}" onclick="toggleGoal('${g.id}')"></div>
          <div style="flex:1;font-size:13.5px;font-weight:500;color:var(--text);${g.done?'text-decoration:line-through;color:var(--text2)':''}">${g.text}</div>
          <button class="btn-icon btn-sm" onclick="deleteGoal('${g.id}')" style="color:var(--red)">✕</button>
        </div>`).join('')
      : `<div class="empty"><div class="empty-icon">🎯</div><div class="empty-text" style="color:var(--text2)">No ${type} goals yet</div></div>`;
  });
  const done=DB.goals.filter(g=>g.uid===uid&&g.done).length;
  const total=DB.goals.filter(g=>g.uid===uid).length;
  $('goalsPct').textContent=(total>0?Math.round(done/total*100):0)+'%';
  $('streakNum').textContent=calcStreak();
  $('streakMsg').textContent=getStreakMsg();
  if(charts.goalsDonut){charts.goalsDonut.data.datasets[0].data=[done||0.001,(total-done)||0.001];charts.goalsDonut.update();}
}

function getStreakMsg(){
  const s=calcStreak();
  if(s===0)return'Start studying to build your streak!';
  if(s<3)return`${s} day streak — keep going!`;
  if(s<7)return`${s} days in a row! Great work 🔥`;
  if(s<14)return`${s} days! You're on fire! 🔥🔥`;
  return`${s} days! Unstoppable! 🔥🔥🔥`;
}

function toggleGoal(id){const g=DB.goals.find(x=>x.id===id);if(g){g.done=!g.done;renderGoals();toast(g.done?'Goal achieved! 🎯':'Goal marked pending.','success');}}
function openAddGoal(){$('goalText').value='';$('goalType').value='daily';$('goalModal').classList.add('open');}
function saveGoal(){const text=$('goalText').value.trim();if(!text){toast('Enter a goal.','error');return;}DB.goals.push({id:uid(),uid:currentUser.id,text,type:$('goalType').value,done:false});closeModal('goalModal');toast('Goal added!','success');renderGoals();}
function deleteGoal(id){DB.goals=DB.goals.filter(x=>x.id!==id);renderGoals();toast('Goal removed.','info');}

let noteFilters={text:'',subject:''};
let pendingNoteImage=null;

function handleNoteImage(input){
  const file=input.files[0];
  if(!file)return;
  if(!file.type.startsWith('image/')){toast('Please select an image file.','error');return;}
  const reader=new FileReader();
  reader.onload=e=>{
    pendingNoteImage=e.target.result;
    $('noteImagePreview').innerHTML=`<img src="${pendingNoteImage}" style="max-width:100%;max-height:150px;border-radius:6px;margin-top:8px;border:1px solid var(--border)">`;
    toast('Image attached!','success');
  };
  reader.readAsDataURL(file);
}

function renderNotes(f=noteFilters){
  if(!currentUser)return;
  let notes=DB.notes.filter(n=>n.uid===currentUser.id);
  if(f.text)notes=notes.filter(n=>n.title.toLowerCase().includes(f.text.toLowerCase())||n.content.toLowerCase().includes(f.text.toLowerCase()));
  if(f.subject)notes=notes.filter(n=>n.subject===f.subject);
  notes.sort((a,b)=>b.date.localeCompare(a.date));
  const el=$('notesList');
  if(!notes.length){el.innerHTML=`<div class="empty"><div class="empty-icon">📝</div><div class="empty-text">No notes yet</div><div class="empty-sub">${DB.notes.filter(n=>n.uid===currentUser.id).length?'Try clearing filters':'Click "+ Add Note" to start'}</div></div>`;return;}
  el.innerHTML=notes.map(n=>`<div class="note-card">
    <div class="note-tag" style="color:${getSubjectColor(n.subject)}">${n.subject}</div>
    <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px">${n.title}</div>
    ${n.image?`<img src="${n.image}" style="width:100%;max-height:200px;object-fit:cover;border-radius:7px;margin-bottom:8px;border:1px solid var(--border)">`:''}
    <div style="font-size:13px;color:var(--text2);line-height:1.65;white-space:pre-wrap">${n.content}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
      <span style="font-size:11.5px;color:var(--text2)">📅 ${n.date}</span>
      <div style="display:flex;gap:6px">
        <button class="btn-icon btn-sm" onclick="editNote('${n.id}')">✎</button>
        <button class="btn-icon btn-sm" onclick="deleteNote('${n.id}')" style="color:var(--red)">✕</button>
      </div>
    </div>
  </div>`).join('');
}

let editNoteId=null;
function openAddNote(){
  if(!getSubjects().length){toast('Add a subject first.','warning');showPage('profile');return;}
  editNoteId=null;pendingNoteImage=null;
  $('noteModalTitle').textContent='Add Note';
  $('noteSubject').value=getSubjects()[0]?.name||'';
  $('noteTitle').value='';$('noteContent').value='';
  $('noteImagePreview').innerHTML='';$('noteImageInput').value='';
  $('noteModal').classList.add('open');
}
function editNote(id){
  const n=DB.notes.find(x=>x.id===id);if(!n)return;
  editNoteId=id;pendingNoteImage=n.image||null;
  $('noteModalTitle').textContent='Edit Note';
  $('noteSubject').value=n.subject;$('noteTitle').value=n.title;$('noteContent').value=n.content;
  $('noteImagePreview').innerHTML=n.image?`<img src="${n.image}" style="max-width:100%;max-height:150px;border-radius:6px;margin-top:8px;border:1px solid var(--border)">`:'';
  $('noteModal').classList.add('open');
}
function saveNote(){
  const title=$('noteTitle').value.trim();
  if(!title){toast('Enter a title.','error');return;}
  const data={uid:currentUser.id,subject:$('noteSubject').value,title,content:$('noteContent').value||'',image:pendingNoteImage||null,date:today()};
  if(editNoteId){const i=DB.notes.findIndex(x=>x.id===editNoteId);if(i>-1)DB.notes[i]={...DB.notes[i],...data};}
  else{data.id=uid();DB.notes.push(data);}
  closeModal('noteModal');pendingNoteImage=null;
  toast(editNoteId?'Note updated!':'Note saved!','success');editNoteId=null;renderNotes();
}
async function deleteNote(id){const ok=await showSystemDialog({title:'Delete Note',message:'Delete this note?',confirm:true,okText:'Delete'});if(!ok)return;DB.notes=DB.notes.filter(x=>x.id!==id);renderNotes();toast('Note deleted.','info');}
function clearNoteFilters(){noteFilters={text:'',subject:''};$('noteSearch').value='';$('noteSubjectFilter').value='';renderNotes();}

function timerStart(){
  if(timerState.running)return;
  if(breakState.running){toast('Stop the break timer first.','warning');return;}
  const subj=$('timerSubject').value;
  if(!subj){toast('Select a subject first.','error');return;}
  timerState.running=true;timerState.subject=subj;
  timerState.interval=setInterval(()=>{timerState.seconds++;$('timerDisplay').textContent=fmt(timerState.seconds);},1000);
  $('timerStartBtn').disabled=true;$('timerPauseBtn').disabled=false;$('timerStopBtn').disabled=false;
  $('timerStatus').textContent='● Studying: '+subj;$('timerStatus').style.color='var(--green)';
}

function timerPause(){
  if(!timerState.running)return;
  timerState.running=false;clearInterval(timerState.interval);
  $('timerStartBtn').disabled=false;$('timerPauseBtn').disabled=true;
  $('timerStatus').textContent='⏸ Paused';$('timerStatus').style.color='var(--amber)';
}

function timerStop(){
  if(!timerState.seconds){toast('No time recorded yet.','warning');return;}
  const secs=timerState.seconds;
  const subj=timerState.subject;
  const matchedSess=DB.sessions.find(s=>s.uid===currentUser.id&&s.subject===subj&&s.date===today()&&!s.done);
  DB.timerLogs.push({id:uid(),uid:currentUser.id,subject:subj,seconds:secs,date:today(),linkedSession:matchedSess?.id||null});
  if(matchedSess){
    toast(`Logged ${fmt(secs)} for "${subj}" — linked to today's session!`,'success');
    addNotif(`⏱ Logged ${fmt(secs)} for ${subj} (linked to session)`,'yellow');
  } else {
    toast(`Session logged: ${fmt(secs)} for ${subj}`,'success');
    addNotif(`⏱ Logged ${fmt(secs)} for ${subj}`,'yellow');
  }
  timerFullReset();
  renderTimerLog();renderDashboard();updateCharts();
  if($('page-analytics').classList.contains('active'))initAnalyticsCharts();
  if($('page-timer').classList.contains('active'))initTimerChart();
}

function timerFullReset(){
  timerState.running=false;clearInterval(timerState.interval);
  timerState.seconds=0;timerState.subject='';
  $('timerDisplay').textContent='00:00:00';
  $('timerStartBtn').disabled=false;$('timerPauseBtn').disabled=true;$('timerStopBtn').disabled=true;
  $('timerStatus').textContent='Ready';$('timerStatus').style.color='var(--text2)';
}

function startBreak(secs){
  if(breakState.running){breakStop();return;}
  breakState.total=secs;breakState.seconds=secs;breakState.running=true;
  const wasPaused=!timerState.running;
  if(timerState.running)timerPause();
  $('breakDisplay').textContent=fmtBreak(secs);
  $('breakPanel').classList.remove('hidden');
  breakState.interval=setInterval(()=>{
    breakState.seconds--;
    $('breakDisplay').textContent=fmtBreak(breakState.seconds);
    const pct=((breakState.total-breakState.seconds)/breakState.total)*100;
    $('breakProgress').style.width=pct+'%';
    if(breakState.seconds<=0){
      breakStop();
      toast('Break time is over! Back to studying! 📚','info');
      addNotif('⏰ Break ended — resume your session!','yellow');
    }
  },1000);
  toast(`${Math.floor(secs/60)}-min break started. Study timer paused.`,'info');
}

function breakStop(){
  if(!breakState.running&&!breakState.interval)return;
  clearInterval(breakState.interval);
  breakState.running=false;breakState.seconds=0;
  $('breakPanel').classList.add('hidden');
  $('breakDisplay').textContent='00:00';
  $('breakProgress').style.width='0%';
}

function renderTimerLog(){
  if(!currentUser)return;
  const uid=currentUser.id;
  const logs=DB.timerLogs.filter(l=>l.uid===uid).slice().reverse().slice(0,10);
  const el=$('timerLog');
  if(!logs.length){el.innerHTML='<div class="empty"><div class="empty-icon">⏱</div><div class="empty-text" style="color:var(--text2)">No sessions logged yet</div></div>';return;}

  const todaySessions=DB.sessions.filter(s=>s.uid===uid&&s.date===today());
  let compHTML='';
  if(todaySessions.length){
    compHTML=`<div style="margin-bottom:14px;padding:10px;background:var(--yellow-light);border-radius:8px;border:1px solid var(--yellow)">
      <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px">📋 Today's Plan vs Actual</div>
      ${todaySessions.map(s=>{
        const actual=DB.timerLogs.filter(l=>l.uid===uid&&l.subject===s.subject&&l.date===today()).reduce((a,l)=>a+l.seconds,0);
        const planned=s.duration*60;
        const pct=Math.min(Math.round(actual/planned*100),100);
        return `<div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text);margin-bottom:3px">
            <span style="font-weight:600">${s.subject}</span>
            <span>${fmt(actual)} / ${fmt(planned)}</span>
          </div>
          <div style="height:6px;background:var(--border);border-radius:20px"><div style="height:100%;width:${pct}%;background:${s.color||getSubjectColor(s.subject)};border-radius:20px;transition:width .5s"></div></div>
        </div>`;
      }).join('')}
    </div>`;
  }

  el.innerHTML=compHTML+logs.map(l=>{
    const sess=l.linkedSession?DB.sessions.find(s=>s.id===l.linkedSession):null;
    return `<div class="log-row">
      <div style="flex:1">
        <span style="font-weight:600;color:var(--text)">${l.subject}</span>
        ${sess?`<span style="font-size:10.5px;background:var(--yellow-bg);color:var(--amber);padding:1px 6px;border-radius:10px;margin-left:6px">linked</span>`:''}
        <span style="color:var(--text2);font-size:12px;margin-left:8px">${l.date}</span>
      </div>
      <span class="badge badge-yellow">${fmt(l.seconds)}</span>
    </div>`;
  }).join('');
}

function initTimerChart(){
  if(!currentUser||!$('timerBarChart'))return;
  const c=chartColors();
  const uid=currentUser.id;
  const subs=getSubjects();
  const actual=subs.map(s=>+(DB.timerLogs.filter(l=>l.uid===uid&&l.subject===s.name).reduce((a,l)=>a+l.seconds,0)/3600).toFixed(1));
  const planned=subs.map(s=>+(DB.sessions.filter(ss=>ss.uid===uid&&ss.subject===s.name).reduce((a,ss)=>a+ss.duration,0)/60).toFixed(1));
  if(charts.timerBar)charts.timerBar.destroy();
  charts.timerBar=new Chart($('timerBarChart'),{
    type:'bar',
    data:{labels:subs.length?subs.map(s=>s.name):['No subjects'],datasets:[
      {label:'Actual (hrs)',data:subs.length?actual:[0],backgroundColor:'#F5C800cc',borderRadius:6},
      {label:'Planned (hrs)',data:subs.length?planned:[0],backgroundColor:'rgba(59,130,246,.5)',borderRadius:6}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:c.text}}},scales:{y:{beginAtZero:true,ticks:{color:c.text},grid:{color:c.grid}},x:{ticks:{color:c.text},grid:{display:false}}}}
  });
}

const FIRE_LEVELS=[
  {min:0, emoji:'⭐', label:'Just Started', color:'#9CA3AF'},
  {min:3, emoji:'✨', label:'Warming Up', color:'#FCD34D'},
  {min:7, emoji:'🔥', label:'On Fire', color:'#F97316'},
  {min:14, emoji:'🔥🔥', label:'Blazing', color:'#EF4444'},
  {min:21, emoji:'🌟🔥', label:'Inferno', color:'#DC2626'},
  {min:28, emoji:'🔥🔥🔥', label:'Unstoppable', color:'#B91C1C'},
  {min:35, emoji:'💥🔥', label:'Legendary', color:'#7F1D1D'},
  {min:42, emoji:'⚡🔥⚡', label:'Mythic', color:'#F59E0B'},
  {min:49, emoji:'🌋🔥', label:'Volcanic', color:'#D97706'},
  {min:56, emoji:'🔥💎🔥', label:'Diamond', color:'#3B82F6'},
  {min:63, emoji:'🌠🔥🌠', label:'Transcendent', color:'#8B5CF6'},
];

function getFireLevel(streak){
  let level=FIRE_LEVELS[0];
  for(const l of FIRE_LEVELS){if(streak>=l.min)level=l;else break;}
  return level;
}

const BADGES=[
  {icon:'🎯',name:'First Session',desc:'Complete your first study session',check:()=>DB.sessions.some(s=>s.uid===currentUser.id&&s.done)},
  {icon:'✅',name:'Task Starter',desc:'Add your first task',check:()=>DB.tasks.some(t=>t.uid===currentUser.id)},
  {icon:'✅✅',name:'Task Master',desc:'Complete 5 tasks',check:()=>DB.tasks.filter(t=>t.uid===currentUser.id&&t.done).length>=5},
  {icon:'🏆',name:'Task Champion',desc:'Complete 20 tasks',check:()=>DB.tasks.filter(t=>t.uid===currentUser.id&&t.done).length>=20},
  {icon:'📝',name:'Note Taker',desc:'Add your first note',check:()=>DB.notes.some(n=>n.uid===currentUser.id)},
  {icon:'📚',name:'Bookworm',desc:'Add 5+ notes',check:()=>DB.notes.filter(n=>n.uid===currentUser.id).length>=5},
  {icon:'⏱',name:'Time Tracker',desc:'Log your first study session',check:()=>DB.timerLogs.some(l=>l.uid===currentUser.id)},
  {icon:'⏰',name:'Dedicated',desc:'Log 5+ total hours',check:()=>DB.timerLogs.filter(l=>l.uid===currentUser.id).reduce((a,l)=>a+l.seconds,0)>=18000},
  {icon:'🕰️',name:'Marathoner',desc:'Log 20+ total hours',check:()=>DB.timerLogs.filter(l=>l.uid===currentUser.id).reduce((a,l)=>a+l.seconds,0)>=72000},
  {icon:'🎯',name:'Goal Setter',desc:'Set your first goal',check:()=>DB.goals.some(g=>g.uid===currentUser.id)},
  {icon:'🏅',name:'Goal Getter',desc:'Complete 5 goals',check:()=>DB.goals.filter(g=>g.uid===currentUser.id&&g.done).length>=5},
  {icon:'💎',name:'Planner Pro',desc:'Add 10+ study sessions',check:()=>DB.sessions.filter(s=>s.uid===currentUser.id).length>=10},
  {icon:'📅',name:'Consistent',desc:'Plan sessions for 5 different days',check:()=>new Set(DB.sessions.filter(s=>s.uid===currentUser.id).map(s=>s.date)).size>=5},
  {icon:'🌟',name:'3-Day Streak',desc:'Study 3 days in a row',check:()=>calcStreak()>=3},
  {icon:'🔥',name:'Week Warrior',desc:'7-day study streak',check:()=>calcStreak()>=7},
  {icon:'🔥🔥',name:'Fortnight Fire',desc:'14-day streak',check:()=>calcStreak()>=14},
  {icon:'🔥🔥🔥',name:'Monthly Master',desc:'30-day streak',check:()=>calcStreak()>=30},
  {icon:'💯',name:'All-Rounder',desc:'Have sessions, tasks, goals & notes',check:()=>DB.sessions.some(s=>s.uid===currentUser.id)&&DB.tasks.some(t=>t.uid===currentUser.id)&&DB.goals.some(g=>g.uid===currentUser.id)&&DB.notes.some(n=>n.uid===currentUser.id)},
];

function renderAchievements(){
  if(!currentUser)return;
  const streak=calcStreak();
  const fire=getFireLevel(streak);
  const nextLevel=FIRE_LEVELS.find(l=>l.min>streak)||FIRE_LEVELS[FIRE_LEVELS.length-1];
  const pct=nextLevel.min>0?Math.min((streak/nextLevel.min)*100,100):100;

  $('streakNum2').textContent=streak;
  $('streakFire').textContent=fire.emoji;
  $('streakFireLabel').textContent=fire.label;
  $('streakFireLabel').style.color=fire.color;
  $('streakMsg2').textContent=getStreakMsg();
  $('streakBar').style.width=pct+'%';
  $('streakBar').style.background=fire.color;
  $('streakBarLabel').textContent=nextLevel.min>streak?`${streak}/${nextLevel.min} days to "${nextLevel.label}"`:'Max level reached!';

  $('fireLevelsPreview').innerHTML=FIRE_LEVELS.map(l=>`
    <div style="text-align:center;padding:8px;border:1.5px solid ${streak>=l.min?l.color:'var(--border)'};border-radius:8px;background:${streak>=l.min?l.color+'11':'transparent'};transition:all .2s">
      <div style="font-size:20px">${l.emoji}</div>
      <div style="font-size:10px;font-weight:700;color:${streak>=l.min?l.color:'var(--text3)'};margin-top:4px">${l.label}</div>
      <div style="font-size:9px;color:var(--text3)">${l.min}+ days</div>
    </div>`).join('');

  $('badgeGrid').innerHTML=BADGES.map(b=>{
    const earned=b.check();
    return `<div class="ach-card ${earned?'':'locked'}">
      <div class="ach-icon">${b.icon}</div>
      <div class="ach-name">${b.name}</div>
      <div class="ach-desc">${b.desc}</div>
      <div style="font-size:10px;margin-top:6px;color:${earned?'var(--green)':'var(--text3)'}">${earned?'✓ Earned':'Locked'}</div>
    </div>`;
  }).join('');
}

function saveProfile(){
  const name=$('editName').value.trim();
  const email=$('editEmail').value.trim().toLowerCase();
  const course=$('editCourse').value.trim();
  if(!name||!email||!course){toast('Fill in all fields.','error');return;}
  currentUser.name=name;currentUser.email=email;currentUser.course=course;currentUser.year=$('editYear').value;
  const idx=DB.users.findIndex(u=>u.id===currentUser.id);
  if(idx>-1)DB.users[idx]={...DB.users[idx],...currentUser};
  updateUserUI();toast('Profile saved!','success');
}

function changePassword(){
  const cur=$('curPass').value,nw=$('newPass').value,conf=$('confPass').value;
  if(!cur||!nw||!conf){toast('Fill in all fields.','error');return;}
  if(currentUser.pass!==cur){toast('Current password is incorrect.','error');return;}
  if(nw!==conf){toast("Passwords don't match.",'error');return;}
  if(nw.length<6){toast('Password must be at least 6 characters.','error');return;}
  currentUser.pass=nw;
  const idx=DB.users.findIndex(u=>u.id===currentUser.id);
  if(idx>-1)DB.users[idx].pass=nw;
  $('curPass').value='';$('newPass').value='';$('confPass').value='';
  toast('Password changed!','success');
}

function chartColors(){
  const dark=document.body.classList.contains('dark');
  return{text:dark?'#aaa':'#666',grid:dark?'rgba(255,255,255,.06)':'rgba(0,0,0,.06)',yellow:'#F5C800'};
}

function initCharts(){
  if(!currentUser)return;
  const c=chartColors();
  const uid=currentUser.id;
  const tasks=DB.tasks.filter(t=>t.uid===uid);
  const done=tasks.filter(t=>t.done).length;
  const total=tasks.length;

  if(charts.dashDonut)charts.dashDonut.destroy();
  charts.dashDonut=new Chart($('dashDonutChart'),{type:'doughnut',data:{labels:['Done','Remaining'],datasets:[{data:[done||0.001,(total-done)||0.001],backgroundColor:['#F5C800','#E5E5E5'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'72%',plugins:{legend:{display:false}}}});

  if(charts.progressDonut)charts.progressDonut.destroy();
  charts.progressDonut=new Chart($('progressDonutChart'),{type:'doughnut',data:{labels:['Done','Pending'],datasets:[{data:[done||0.001,(total-done)||0.001],backgroundColor:['#F5C800','#E5E5E5'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'70%',plugins:{legend:{display:false}}}});

  if(charts.goalsDonut)charts.goalsDonut.destroy();
  const gd=DB.goals.filter(g=>g.uid===uid&&g.done).length;
  const gp=DB.goals.filter(g=>g.uid===uid&&!g.done).length;
  charts.goalsDonut=new Chart($('goalsDonutChart'),{type:'doughnut',data:{labels:['Done','Pending'],datasets:[{data:[gd||0.001,gp||0.001],backgroundColor:['#F5C800','#E5E5E5'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'70%',plugins:{legend:{display:false}}}});

  updateTrendChart();
}

function updateTrendChart(){
  if(!currentUser||!$('trendChart'))return;
  const c=chartColors();
  const uid=currentUser.id;
  const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const data=days.map((_,i)=>{
    const date=new Date();date.setDate(date.getDate()-date.getDay()+1+i);
    const ds=date.toISOString().split('T')[0];
    return +(DB.timerLogs.filter(l=>l.uid===uid&&l.date===ds).reduce((a,l)=>a+l.seconds,0)/3600).toFixed(1);
  });
  if(charts.trendChart)charts.trendChart.destroy();
  charts.trendChart=new Chart($('trendChart'),{type:'line',data:{labels:days,datasets:[{label:'Hours',data,borderColor:'#F5C800',backgroundColor:'rgba(245,200,0,.12)',fill:true,tension:.4,pointRadius:4,pointBackgroundColor:'#F5C800'}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true,ticks:{color:c.text},grid:{color:c.grid}},x:{ticks:{color:c.text},grid:{display:false}}},plugins:{legend:{display:false}}}});
}

function updateCharts(){if(!currentUser)return;renderDashboard();renderProgress();renderGoals();renderAchievements();}

function addNotif(text,color='yellow'){
  notifItems.unshift({text,color,time:'Just now'});
  if(notifItems.length>15)notifItems.pop();
  buildNotifs();
}
function pushReminderOnce(key,text,color='amber'){
  if(sentReminderKeys.has(key))return;
  sentReminderKeys.add(key);
  addNotif(text,color);
}
function queueTaskReminders(){
  if(!currentUser)return;
  const settings=getUserSettings();
  const leadMinutes=parseInt(settings.deadlineLeadMinutes||60,10);
  const uid=currentUser.id;
  const now=new Date();
  DB.tasks.filter(t=>t.uid===uid&&!t.done).forEach(t=>{
    if(!t.deadline)return;
    const dl=new Date(`${t.deadline}T${t.deadlineTime||'23:59'}`);
    const diffMin=Math.floor((dl-now)/60000);
    if(settings.taskAlerts && diffMin>=0 && diffMin<=leadMinutes){
      pushReminderOnce(`soon-${t.id}`,`⏰ Deadline soon: "${t.title}" in ${diffMin} min`,'amber');
      if(settings.reminderEmail){
        pushReminderOnce(`email-soon-${t.id}`,`📧 Email reminder queued for ${settings.reminderEmail}: ${t.title}`,'blue');
      }
    }
    if(settings.missingAlerts && diffMin<0){
      pushReminderOnce(`overdue-${t.id}`,`🚨 Overdue task: "${t.title}" (${Math.abs(diffMin)} min late)`,'red');
      if(settings.reminderEmail){
        pushReminderOnce(`email-overdue-${t.id}`,`📧 Overdue email reminder queued for ${settings.reminderEmail}`,'red');
      }
    }
  });
}
function buildNotifs(){
  const el=$('notifList');
  if(!el)return;
  if(!notifItems.length){el.innerHTML='<div class="notif-empty">No notifications yet</div>';return;}
  el.innerHTML=notifItems.map(n=>`<div class="notif-item"><div class="notif-dot" style="background:var(--${n.color||'yellow'})"></div><div><div class="notif-text">${n.text}</div><div class="notif-time">${n.time}</div></div></div>`).join('');
}
function toggleNotif(){$('notifPanel').classList.toggle('open');}
function closeNotif(){$('notifPanel').classList.remove('open');}
document.addEventListener('click',e=>{const p=$('notifPanel');if(p&&!p.contains(e.target)&&!e.target.closest('.tb-notif'))p.classList.remove('open');});

function toggleDark(){
  darkMode=!darkMode;
  const settings=getUserSettings();
  settings.darkMode=darkMode;
  DB.settings[currentUser.id]=settings;
  document.body.classList.toggle('dark',darkMode);
  if($('darkToggleSetting'))$('darkToggleSetting').checked=darkMode;
  $('tbDarkIcon').textContent=darkMode?'☀':'◑';
  setTimeout(()=>{initCharts();if($('page-analytics').classList.contains('active'))initAnalyticsCharts();if($('page-timer').classList.contains('active'))initTimerChart();},50);
}

function closeModal(id){$(id).classList.remove('open');}
document.addEventListener('click',e=>{if(e.target.classList.contains('modal-overlay'))e.target.classList.remove('open');});

function getUserSettings(){
  if(!currentUser)return {};
  if(!DB.settings[currentUser.id]){
    DB.settings[currentUser.id]={
      darkMode:false,
      sessionReminders:true,
      taskAlerts:true,
      missingAlerts:true,
      streakAlerts:true,
      reminderEmail:currentUser.email||'',
      defaultDuration:60,
      defaultBreak:600,
      weekStarts:'monday',
      focusSound:false,
      defaultTaskPriority:'Medium',
      deadlineLeadMinutes:60,
    };
  }
  return DB.settings[currentUser.id];
}

function initSettingsUI(){
  if(!currentUser)return;
  const s=getUserSettings();
  if($('setSessionReminders'))$('setSessionReminders').checked=!!s.sessionReminders;
  if($('setTaskAlerts'))$('setTaskAlerts').checked=!!s.taskAlerts;
  if($('setMissingAlerts'))$('setMissingAlerts').checked=!!s.missingAlerts;
  if($('setStreakAlerts'))$('setStreakAlerts').checked=!!s.streakAlerts;
  if($('setReminderEmail'))$('setReminderEmail').value=s.reminderEmail||'';
  if($('setDefaultDuration'))$('setDefaultDuration').value=String(s.defaultDuration||60);
  if($('setDefaultBreak'))$('setDefaultBreak').value=String(s.defaultBreak||600);
  if($('setWeekStarts'))$('setWeekStarts').value=s.weekStarts||'monday';
  if($('setFocusSound'))$('setFocusSound').checked=!!s.focusSound;
  if($('setDefaultTaskPriority'))$('setDefaultTaskPriority').value=s.defaultTaskPriority||'Medium';
  if($('setDeadlineLeadMinutes'))$('setDeadlineLeadMinutes').value=String(s.deadlineLeadMinutes||60);
}

function saveSettings(){
  if(!currentUser)return;
  const prev=getUserSettings();
  const next={
    ...prev,
    sessionReminders:Boolean($('setSessionReminders') && $('setSessionReminders').checked),
    taskAlerts:Boolean($('setTaskAlerts') && $('setTaskAlerts').checked),
    missingAlerts:Boolean($('setMissingAlerts') && $('setMissingAlerts').checked),
    streakAlerts:Boolean($('setStreakAlerts') && $('setStreakAlerts').checked),
    reminderEmail:$('setReminderEmail') ? $('setReminderEmail').value.trim() : '',
    defaultDuration:parseInt($('setDefaultDuration') ? $('setDefaultDuration').value : '60',10),
    defaultBreak:parseInt($('setDefaultBreak') ? $('setDefaultBreak').value : '600',10),
    weekStarts:$('setWeekStarts') ? $('setWeekStarts').value : 'monday',
    focusSound:Boolean($('setFocusSound') && $('setFocusSound').checked),
    defaultTaskPriority:$('setDefaultTaskPriority') ? $('setDefaultTaskPriority').value : 'Medium',
    deadlineLeadMinutes:parseInt($('setDeadlineLeadMinutes') ? $('setDeadlineLeadMinutes').value : '60',10),
    darkMode:darkMode,
  };
  DB.settings[currentUser.id]=next;
  if(next.reminderEmail && next.reminderEmail!==prev.reminderEmail){
    addNotif(`📧 Reminder email updated: ${next.reminderEmail}`,'blue');
  }
}

function exportUserData(){
  if(!currentUser)return;
  const uid=currentUser.id;
  const payload={
    exportedAt:nowISO(),
    user:{...currentUser,pass:undefined},
    settings:getUserSettings(),
    subjects:DB.subjects[uid]||[],
    sessions:DB.sessions.filter(s=>s.uid===uid),
    tasks:DB.tasks.filter(t=>t.uid===uid),
    goals:DB.goals.filter(g=>g.uid===uid),
    notes:DB.notes.filter(n=>n.uid===uid),
    timerLogs:DB.timerLogs.filter(l=>l.uid===uid),
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`tip-study-hub-${currentUser.name.replace(/\s+/g,'-').toLowerCase()}-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  toast('Your data export is ready.','success');
}

function sendReminderDigest(){
  if(!currentUser)return;
  const settings=getUserSettings();
  const email=(settings.reminderEmail||'').trim();
  if(!email){toast('Set a reminder email first in Settings.','warning');return;}
  const uid=currentUser.id;
  const pending=DB.tasks.filter(t=>t.uid===uid&&!t.done&&getTaskStatus(t)!=='overdue');
  const overdue=DB.tasks.filter(t=>t.uid===uid&&!t.done&&getTaskStatus(t)==='overdue');
  const lines=[
    `TIP Study Hub Reminder Digest - ${today()}`,
    '',
    `Student: ${currentUser.name}`,
    '',
    `Pending tasks (${pending.length}):`,
    ...(pending.length?pending.map((t,i)=>`${i+1}. ${t.title} [${t.subject}] - ${t.deadline||'No date'} ${t.deadlineTime||''}`):['- None']),
    '',
    `Overdue tasks (${overdue.length}):`,
    ...(overdue.length?overdue.map((t,i)=>`${i+1}. ${t.title} [${t.subject}] - ${t.deadline||'No date'} ${t.deadlineTime||''}`):['- None']),
  ];
  const subject=encodeURIComponent(`TIP Study Hub Digest - ${today()}`);
  const body=encodeURIComponent(lines.join('\n'));
  window.location.href=`mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
  addNotif(`📧 Reminder digest prepared for ${email}`,'blue');
}

function enhanceDateTimePickers(){
  ['taskDeadline','taskDeadlineTime','sessionDate','sessionTime'].forEach(id=>{
    const el=$(id);
    if(!el || el.dataset.pickerBound==='1')return;
    el.dataset.pickerBound='1';
    el.addEventListener('click',()=>{
      if(typeof el.showPicker==='function'){
        try{el.showPicker();}catch(_){}
      }
    });
  });
}

function transitionScreens(fromId,toId,onDone){
  const from=$(fromId),to=$(toId);
  if(!from||!to){if(typeof onDone==='function')onDone();return;}
  to.classList.remove('hidden');
  to.classList.add('screen-prep');
  requestAnimationFrame(()=>{
    from.classList.add('screen-fade-out');
    to.classList.add('screen-fade-in');
  });
  setTimeout(()=>{
    from.classList.add('hidden');
    from.classList.remove('screen-fade-out');
    to.classList.remove('screen-prep','screen-fade-in');
    if(typeof onDone==='function')onDone();
  },330);
}

function showSystemDialog({title='System Message',message='',confirm=false,okText='OK'}={}){
  const modal=$('systemDialogModal');
  if(!modal){return Promise.resolve(true);}
  $('systemDialogTitle').textContent=title;
  $('systemDialogMessage').textContent=message;
  $('systemDialogOk').textContent=okText;
  $('systemDialogCancel').style.display=confirm?'inline-flex':'none';
  modal.classList.add('open');
  return new Promise(resolve=>{dialogResolver=resolve;});
}

function closeSystemDialog(result){
  const modal=$('systemDialogModal');
  if(modal)modal.classList.remove('open');
  if(dialogResolver){dialogResolver(result);dialogResolver=null;}
}

window.addEventListener('error',e=>{
  if(!e || !e.message)return;
  showSystemDialog({title:'App Error',message:e.message,confirm:false,okText:'OK'});
});

window.addEventListener('unhandledrejection',e=>{
  const msg=e && e.reason ? String(e.reason) : 'An unexpected error occurred.';
  showSystemDialog({title:'App Error',message:msg,confirm:false,okText:'OK'});
});

function clearAllData(){
  showSystemDialog({title:'Clear All Data',message:'Clear ALL your data? This cannot be undone.',confirm:true,okText:'Clear'}).then(ok=>{
  if(!ok)return;
  const uid=currentUser.id;
  DB.sessions=DB.sessions.filter(s=>s.uid!==uid);
  DB.tasks=DB.tasks.filter(t=>t.uid!==uid);
  DB.goals=DB.goals.filter(g=>g.uid!==uid);
  DB.notes=DB.notes.filter(n=>n.uid!==uid);
  DB.timerLogs=DB.timerLogs.filter(l=>l.uid!==uid);
  DB.subjects[uid]=[];
  sentReminderKeys = new Set();
  renderAll();initCharts();
  toast('All data cleared.','info');
  });
}