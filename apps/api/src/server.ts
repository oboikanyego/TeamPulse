import http from 'node:http';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { type Response } from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './openapi.js';
import { cacheMode, cacheReady, cacheGet, cacheSet } from './cache.js';
import { initPersistence, loadState, persistenceMode, persistenceReady, saveState } from './persistence.js';
import { authRequired, type AuthedRequest, signToken, verifyToken, type Role } from './auth.js';
import {
  commentSchema,
  credentialsSchema,
  githubRepositorySchema,
  githubTaskLinkSchema,
  notificationPreferencesSchema,
  slackIntegrationSchema,
  automationRunSchema,
  assistantSchema,
  invitationSchema,
  roleUpdateSchema,
  workspaceSettingsSchema,
  memberSchema,
  projectSchema,
  registerSchema,
  sprintSchema,
  sprintStatusSchema,
  taskPatchSchema,
  taskSchema,
  taskSprintSchema,
  timeEntrySchema,
  capacitySchema,
  workspaceSchema
} from './validation.js';

const port = Number(process.env.PORT || 8080);
const corsOrigin = process.env.CORS_ORIGIN || '*';

type User = { id:string; name:string; email:string; avatar_url:string|null; password_hash:string };
type Workspace = { id:string; name:string; description:string; owner_id:string };
type Membership = { workspace_id:string; user_id:string; role:Role };
type Project = { id:string; workspace_id:string; name:string; description:string; status:string; priority:string; owner_id:string|null };
type Sprint = { id:string; workspace_id:string; name:string; goal:string; status:'Planned'|'Active'|'Completed'; start_date:string|null; end_date:string|null; created_at:string };
type Task = { id:string; project_id:string; sprint_id:string|null; title:string; description:string; type:string; status:string; priority:string; assignee_id:string|null; reporter_id:string|null; story_points:number|null; due_date:string|null; labels:string[]; updated_at:string };
type Comment = { id:string; task_id:string; user_id:string; body:string; created_at:string };
type TimeEntry = { id:string; task_id:string; user_id:string; minutes:number; note:string; spent_at:string; created_at:string };
type Capacity = { workspace_id:string; user_id:string; weekly_minutes:number };
type GitHubRepository = { id:string; workspace_id:string; owner:string; repo:string; created_at:string };
type GitHubTaskLink = { task_id:string; repository_id:string; pull_number:number; created_at:string };
type Activity = { id:string; workspace_id:string; actor_id:string|null; entity_type:string; entity_id:string|null; action:string; metadata:Record<string,unknown>; created_at:string };
type Notification = { id:string; user_id:string; workspace_id?:string|null; kind?:string; message:string; read_at:string|null; created_at?:string };
type NotificationPreferences = { workspace_id:string; task_assigned:boolean; task_blocked:boolean; task_overdue:boolean; sprint_changed:boolean; ci_failed:boolean; daily_digest:boolean; slack_enabled:boolean };
type SlackIntegration = { workspace_id:string; webhook_url:string|null; channel_name:string|null; enabled:boolean; updated_at:string };
type AutomationEvent = { id:string; workspace_id:string; key:string; kind:string; message:string; created_at:string };
type Invitation = { id:string; workspace_id:string; email:string; role:Role; token:string; status:'pending'|'accepted'|'revoked'; invited_by:string; created_at:string; accepted_at:string|null };
type WorkspaceSettings = { workspace_id:string; timezone:string; week_starts_on:'monday'|'sunday'; updated_at:string };
type WorkspacePlan = { workspace_id:string; plan:'free'|'team'|'business'; seats:number; status:'active'|'trial'; trial_ends_at:string|null; updated_at:string };

const users:User[] = [];
const workspaces:Workspace[] = [];
const memberships:Membership[] = [];
const projects:Project[] = [];
const sprints:Sprint[] = [];
const tasks:Task[] = [];
const comments:Comment[] = [];
const timeEntries:TimeEntry[] = [];
const capacities:Capacity[] = [];
const githubRepositories:GitHubRepository[] = [];
const githubTaskLinks:GitHubTaskLink[] = [];
const activities:Activity[] = [];
const notifications:Notification[] = [];
const notificationPreferences:NotificationPreferences[] = [];
const slackIntegrations:SlackIntegration[] = [];
const automationEvents:AutomationEvent[] = [];
const invitations:Invitation[] = [];
const workspaceSettings:WorkspaceSettings[] = [];
const workspacePlans:WorkspacePlan[] = [];

type PersistedState = {
  users:User[]; workspaces:Workspace[]; memberships:Membership[]; projects:Project[]; sprints:Sprint[];
  tasks:Task[]; comments:Comment[]; timeEntries:TimeEntry[]; capacities:Capacity[];
  githubRepositories:GitHubRepository[]; githubTaskLinks:GitHubTaskLink[]; activities:Activity[]; notifications:Notification[];
  notificationPreferences?:NotificationPreferences[]; slackIntegrations?:SlackIntegration[]; automationEvents?:AutomationEvent[];
  invitations?:Invitation[]; workspaceSettings?:WorkspaceSettings[]; workspacePlans?:WorkspacePlan[];
};

function snapshotState():PersistedState {
  return {users,workspaces,memberships,projects,sprints,tasks,comments,timeEntries,capacities,githubRepositories,githubTaskLinks,activities,notifications,notificationPreferences,slackIntegrations,automationEvents,invitations,workspaceSettings,workspacePlans};
}

function restoreState(state:PersistedState):void {
  users.splice(0,users.length,...state.users);
  workspaces.splice(0,workspaces.length,...state.workspaces);
  memberships.splice(0,memberships.length,...state.memberships);
  projects.splice(0,projects.length,...state.projects);
  sprints.splice(0,sprints.length,...state.sprints);
  tasks.splice(0,tasks.length,...state.tasks);
  comments.splice(0,comments.length,...state.comments);
  timeEntries.splice(0,timeEntries.length,...state.timeEntries);
  capacities.splice(0,capacities.length,...state.capacities);
  githubRepositories.splice(0,githubRepositories.length,...state.githubRepositories);
  githubTaskLinks.splice(0,githubTaskLinks.length,...state.githubTaskLinks);
  activities.splice(0,activities.length,...state.activities);
  notifications.splice(0,notifications.length,...state.notifications);
  notificationPreferences.splice(0,notificationPreferences.length,...(state.notificationPreferences??[]));
  slackIntegrations.splice(0,slackIntegrations.length,...(state.slackIntegrations??[]));
  automationEvents.splice(0,automationEvents.length,...(state.automationEvents??[]));
  invitations.splice(0,invitations.length,...(state.invitations??[]));
  workspaceSettings.splice(0,workspaceSettings.length,...(state.workspaceSettings??[]));
  workspacePlans.splice(0,workspacePlans.length,...(state.workspacePlans??[]));
}

let persistQueued=false;
function queuePersist():void {
  if(persistenceMode!=='managed-postgres' || persistQueued) return;
  persistQueued=true;
  setTimeout(()=>{persistQueued=false; void saveState(snapshotState()).catch(error=>console.error('state persistence failed',error));},25);
}

const now = () => new Date().toISOString();
const routeParam = (value: string | string[] | undefined): string => Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',').map(v => v.trim()) }));
app.use(express.json({ limit:'1mb' }));
app.get('/openapi.json', (_req,res) => res.json(openApiSpec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customSiteTitle: 'TeamPulse API Docs',
  swaggerOptions: { persistAuthorization: true, displayRequestDuration: true }
}));

const server = http.createServer(app);
const io = new Server(server, { cors:{ origin: corsOrigin === '*' ? true : corsOrigin.split(',').map(v => v.trim()) } });

function workspaceRole(userId:string, workspaceId:string) {
  return memberships.find(m => m.user_id === userId && m.workspace_id === workspaceId)?.role ?? null;
}
function requireWorkspace(req:AuthedRequest,res:Response,workspaceId:string,roles?:Role[]) {
  const role = req.user ? workspaceRole(req.user.id,workspaceId) : null;
  if (!role) { res.status(403).json({message:'Workspace access denied'}); return null; }
  if (roles && !roles.includes(role)) { res.status(403).json({message:'Insufficient role'}); return null; }
  return role;
}

type Permission = 'workspace.manage'|'member.manage'|'project.manage'|'task.write'|'sprint.manage'|'report.export'|'integration.manage'|'audit.view'|'billing.view';
const rolePermissions:Record<Role,Permission[]>={
  admin:['workspace.manage','member.manage','project.manage','task.write','sprint.manage','report.export','integration.manage','audit.view','billing.view'],
  manager:['project.manage','task.write','sprint.manage','report.export','audit.view','billing.view'],
  member:['task.write'],
  viewer:[]
};
function hasPermission(userId:string,workspaceId:string,permission:Permission):boolean {
  const role=workspaceRole(userId,workspaceId);
  return !!role && rolePermissions[role].includes(permission);
}
function requirePermission(req:AuthedRequest,res:Response,workspaceId:string,permission:Permission){
  const role=requireWorkspace(req,res,workspaceId);
  if(!role) return null;
  if(!req.user || !hasPermission(req.user.id,workspaceId,permission)){res.status(403).json({message:'Permission denied',permission});return null;}
  return role;
}
function settingsFor(workspaceId:string):WorkspaceSettings {
  let item=workspaceSettings.find(s=>s.workspace_id===workspaceId);
  if(!item){item={workspace_id:workspaceId,timezone:'Africa/Johannesburg',week_starts_on:'monday',updated_at:now()};workspaceSettings.push(item);}
  return item;
}
function planFor(workspaceId:string):WorkspacePlan {
  let item=workspacePlans.find(p=>p.workspace_id===workspaceId);
  if(!item){item={workspace_id:workspaceId,plan:'free',seats:5,status:'trial',trial_ends_at:new Date(Date.now()+14*86400000).toISOString(),updated_at:now()};workspacePlans.push(item);}
  return item;
}

function taskWorkspace(task:Task) {
  return projects.find(p=>p.id===task.project_id)?.workspace_id ?? null;
}
function logActivity(workspaceId:string, actorId:string|null, entityType:string, entityId:string|null, action:string, metadata:Record<string,unknown>={}) {
  const item = { id:randomUUID(), workspace_id:workspaceId, actor_id:actorId, entity_type:entityType, entity_id:entityId, action, metadata, created_at:now() };
  activities.unshift(item);
  queuePersist();
  io.to(`workspace:${workspaceId}`).emit('activity.created', item);
  return item;
}


function preferencesFor(workspaceId:string):NotificationPreferences {
  let prefs=notificationPreferences.find(p=>p.workspace_id===workspaceId);
  if(!prefs){
    prefs={workspace_id:workspaceId,task_assigned:true,task_blocked:true,task_overdue:true,sprint_changed:true,ci_failed:true,daily_digest:true,slack_enabled:false};
    notificationPreferences.push(prefs);
    queuePersist();
  }
  return prefs;
}

function prefEnabled(workspaceId:string,kind:string):boolean {
  const p=preferencesFor(workspaceId);
  return kind==='task_assigned'?p.task_assigned:
    kind==='task_blocked'?p.task_blocked:
    kind==='task_overdue'?p.task_overdue:
    kind==='sprint_changed'?p.sprint_changed:
    kind==='ci_failed'?p.ci_failed:
    kind==='daily_digest'?p.daily_digest:true;
}

function pushNotification(workspaceId:string,userId:string,kind:string,message:string):Notification {
  const item:Notification={id:randomUUID(),user_id:userId,workspace_id:workspaceId,kind,message,read_at:null,created_at:now()};
  notifications.unshift(item);
  io.to(`workspace:${workspaceId}`).emit('notification.created',item);
  queuePersist();
  return item;
}

async function sendSlack(workspaceId:string,message:string):Promise<boolean> {
  const prefs=preferencesFor(workspaceId);
  const integration=slackIntegrations.find(s=>s.workspace_id===workspaceId);
  if(!prefs.slack_enabled || !integration?.enabled || !integration.webhook_url) return false;
  try{
    const response=await fetch(integration.webhook_url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:message})});
    if(!response.ok) throw new Error(`Slack webhook failed: ${response.status}`);
    return true;
  }catch(error){
    console.error('slack notification failed',error);
    return false;
  }
}

async function notifyWorkspace(workspaceId:string,kind:string,message:string,targetUserId?:string|null):Promise<void> {
  if(!prefEnabled(workspaceId,kind)) return;
  const recipients=targetUserId ? [targetUserId] : memberships.filter(m=>m.workspace_id===workspaceId).map(m=>m.user_id);
  for(const userId of new Set(recipients)) pushNotification(workspaceId,userId,kind,message);
  await sendSlack(workspaceId,`*TeamPulse* · ${message}`);
}

function recordAutomationEvent(workspaceId:string,key:string,kind:string,message:string):boolean {
  if(automationEvents.some(e=>e.workspace_id===workspaceId&&e.key===key)) return false;
  automationEvents.unshift({id:randomUUID(),workspace_id:workspaceId,key,kind,message,created_at:now()});
  if(automationEvents.length>1000) automationEvents.splice(1000);
  queuePersist();
  return true;
}

function workspaceTasks(workspaceId:string):Task[] {
  const ids=new Set(projects.filter(p=>p.workspace_id===workspaceId).map(p=>p.id));
  return tasks.filter(t=>ids.has(t.project_id));
}

async function runWorkspaceAutomation(workspaceId:string,includeDigest=false){
  const ws=workspaces.find(w=>w.id===workspaceId);
  if(!ws) return {alerts:0,digest:false};
  const list=workspaceTasks(workspaceId);
  let alerts=0;
  for(const task of list.filter(t=>t.status==='Blocked')){
    const key=`blocked:${task.id}:${task.updated_at}`;
    if(recordAutomationEvent(workspaceId,key,'task_blocked',task.title)){
      await notifyWorkspace(workspaceId,'task_blocked',`Blocked task: ${task.title}`,task.assignee_id);
      alerts++;
    }
  }
  const today=Date.now();
  for(const task of list.filter(t=>t.due_date&&t.status!=='Done'&&new Date(t.due_date).getTime()<today)){
    const key=`overdue:${task.id}:${task.due_date}`;
    if(recordAutomationEvent(workspaceId,key,'task_overdue',task.title)){
      await notifyWorkspace(workspaceId,'task_overdue',`Overdue task: ${task.title} (due ${task.due_date})`,task.assignee_id);
      alerts++;
    }
  }
  const cachedInsights=await cacheGet<any>(`github-insights:${workspaceId}`);
  for(const repository of githubRepositories.filter(r=>r.workspace_id===workspaceId)){
    try{
      let failed:any=null;
      const cachedRepo=cachedInsights?.repositories?.find((item:any)=>item.repository_id===repository.id);
      if(cachedRepo?.latest_ci?.status==='completed' && cachedRepo.latest_ci.conclusion && cachedRepo.latest_ci.conclusion!=='success' && cachedRepo.latest_ci.conclusion!=='skipped'){
        failed={id:`cached-${cachedRepo.latest_ci.updated_at}`,name:cachedRepo.latest_ci.name,head_branch:cachedRepo.default_branch??'default',...cachedRepo.latest_ci};
      }else{
        const runs=await githubJson(`/repos/${repository.owner}/${repository.repo}/actions/runs?per_page=5`);
        failed=(runs.workflow_runs??[]).find((r:any)=>r.status==='completed'&&r.conclusion&&r.conclusion!=='success'&&r.conclusion!=='skipped');
      }
      if(failed){
        const key=`ci:${repository.id}:${failed.id}`;
        if(recordAutomationEvent(workspaceId,key,'ci_failed',failed.name)){
          await notifyWorkspace(workspaceId,'ci_failed',`CI failure in ${repository.owner}/${repository.repo}: ${failed.name} on ${failed.head_branch??'default branch'}`);
          alerts++;
        }
      }
    }catch(error){
      const message=error instanceof Error?error.message:'GitHub unavailable';
      if(!message.includes('403')) console.error('CI automation check failed',error);
    }
  }

  const digestHour=Number(process.env.AUTOMATION_DIGEST_HOUR_UTC??6);
  const dateKey=new Date().toISOString().slice(0,10);
  const shouldDigest=includeDigest || new Date().getUTCHours()>=digestHour;
  let digest=false;
  if(shouldDigest && prefEnabled(workspaceId,'daily_digest') && recordAutomationEvent(workspaceId,`digest:${dateKey}`,'daily_digest',dateKey)){
    const blocked=list.filter(t=>t.status==='Blocked').length;
    const overdue=list.filter(t=>t.due_date&&t.status!=='Done'&&new Date(t.due_date).getTime()<today).length;
    const done=list.filter(t=>t.status==='Done').length;
    const active=sprints.find(s=>s.workspace_id===workspaceId&&s.status==='Active');
    await notifyWorkspace(workspaceId,'daily_digest',`Daily digest for ${ws.name}: ${list.length} tasks · ${done} done · ${blocked} blocked · ${overdue} overdue${active?` · Active sprint: ${active.name}`:''}`);
    digest=true;
  }
  return {alerts,digest};
}

async function runAllAutomations():Promise<void> {
  for(const workspace of workspaces) await runWorkspaceAutomation(workspace.id,false);
}

const githubHeaders = () => ({
  Accept:'application/vnd.github+json',
  'User-Agent':'TeamPulse',
  ...(process.env.GITHUB_TOKEN ? {Authorization:`Bearer ${process.env.GITHUB_TOKEN}`} : {})
});

async function githubJson(path:string) {
  const response=await fetch(`https://api.github.com${path}`,{headers:githubHeaders()});
  if(!response.ok) throw new Error(`GitHub request failed: ${response.status}`);
  return response.json() as Promise<any>;
}

function median(values:number[]) {
  if(!values.length) return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[mid]! : Math.round((sorted[mid-1]!+sorted[mid]!)/2);
}

async function seed() {
  if (users.length) return;
  const password_hash = await bcrypt.hash('Demo123!',10);
  const admin:User={id:randomUUID(),name:'Admin Demo',email:'admin@teampulse.demo',avatar_url:null,password_hash};
  const manager:User={id:randomUUID(),name:'Manager Demo',email:'manager@teampulse.demo',avatar_url:null,password_hash};
  const developer:User={id:randomUUID(),name:'Developer Demo',email:'developer@teampulse.demo',avatar_url:null,password_hash};
  users.push(admin,manager,developer);
  const workspace:Workspace={id:randomUUID(),name:'Demo Engineering',description:'A realistic engineering delivery workspace.',owner_id:admin.id};
  workspaces.push(workspace);
  memberships.push(
    {workspace_id:workspace.id,user_id:admin.id,role:'admin'},
    {workspace_id:workspace.id,user_id:manager.id,role:'manager'},
    {workspace_id:workspace.id,user_id:developer.id,role:'member'}
  );
  capacities.push(
    {workspace_id:workspace.id,user_id:admin.id,weekly_minutes:1200},
    {workspace_id:workspace.id,user_id:manager.id,weekly_minutes:1500},
    {workspace_id:workspace.id,user_id:developer.id,weekly_minutes:1800}
  );
  githubRepositories.push({id:randomUUID(),workspace_id:workspace.id,owner:'oboikanyego',repo:'TeamPulse',created_at:now()});
  const project:Project={id:randomUUID(),workspace_id:workspace.id,name:'Claims Platform',description:'Modernise claims intake and communications.',status:'Active',priority:'High',owner_id:manager.id};
  projects.push(project);
  const activeSprint:Sprint={id:randomUUID(),workspace_id:workspace.id,name:'Sprint 12',goal:'Stabilise mailbox intake and finish the delivery dashboard.',status:'Active',start_date:'2026-09-14',end_date:'2026-09-25',created_at:now()};
  const nextSprint:Sprint={id:randomUUID(),workspace_id:workspace.id,name:'Sprint 13',goal:'Improve resilience and operational visibility.',status:'Planned',start_date:'2026-09-28',end_date:'2026-10-09',created_at:now()};
  sprints.push(activeSprint,nextSprint);
  const seedTasks:[string,string,string,string,string,string,string|null,number|null,string[]][] = [
    ['Graph notifications','Receive mailbox change notifications','Feature','In Progress','High',developer.id,null,5,['graph','backend']],
    ['Lifecycle handling','Handle subscription lifecycle events','Task','Review','Medium',manager.id,null,3,['graph']],
    ['Gateway throughput','Measure outbound request volume','Spike','Backlog','Critical',admin.id,null,3,['performance']],
    ['Dashboard polish','Improve operational dashboard','Improvement','Done','Low',developer.id,null,2,['frontend']],
    ['Attachment fetch','Fetch every message attachment','Feature','To Do','High',developer.id,null,5,['graph','api']],
    ['Retry strategy','Design resilient retry handling','Task','Blocked','High',manager.id,null,3,['reliability']]
  ];
  for (const [title,description,type,status,priority,assignee_id,_unused,story_points,labels] of seedTasks) {
    const sprint_id = status === 'Backlog' ? null : activeSprint.id;
    tasks.push({id:randomUUID(),project_id:project.id,sprint_id,title,description,type,status,priority,assignee_id,reporter_id:admin.id,story_points,due_date:null,labels,updated_at:now()});
  }
  logActivity(workspace.id,admin.id,'project',project.id,'created project',{name:project.name});
  const firstTask = tasks[0]!;
  logActivity(workspace.id,manager.id,'task',firstTask.id,'moved task',{title:firstTask.title,status:'In Progress'});
  timeEntries.push(
    {id:randomUUID(),task_id:firstTask.id,user_id:developer.id,minutes:210,note:'Implemented webhook validation and initial event handling.',spent_at:'2026-09-16',created_at:now()},
    {id:randomUUID(),task_id:tasks[1]!.id,user_id:manager.id,minutes:120,note:'Reviewed lifecycle edge cases.',spent_at:'2026-09-17',created_at:now()},
    {id:randomUUID(),task_id:tasks[3]!.id,user_id:developer.id,minutes:150,note:'Dashboard polish and responsive fixes.',spent_at:'2026-09-18',created_at:now()}
  );
  notifications.push({id:randomUUID(),user_id:developer.id,workspace_id:workspace.id,kind:'task_assigned',message:'You were assigned Graph notifications',read_at:null,created_at:now()});
  preferencesFor(workspace.id);
  settingsFor(workspace.id);
  planFor(workspace.id);
}

io.use((socket,next)=>{
  const user = verifyToken(socket.handshake.auth?.token as string|undefined);
  if (!user) return next(new Error('Authentication required'));
  socket.data.user=user; next();
});
io.on('connection',socket=>{
  socket.on('workspace:join',(workspaceId:string)=>{
    const userId=socket.data.user?.id as string|undefined;
    if (userId && workspaceRole(userId,workspaceId)) socket.join(`workspace:${workspaceId}`);
  });
  socket.on('workspace:leave',(workspaceId:string)=>socket.leave(`workspace:${workspaceId}`));
});

app.get('/health',(_req,res)=>res.json({status:'ok',database:persistenceMode,redis:cacheMode}));
const readinessHandler=async(_req:express.Request,res:express.Response)=>{
  const database = await persistenceReady();
  const redis = cacheMode==='disabled' ? null : await cacheReady();
  const ready = persistenceMode==='memory-fallback' ? true : database;
  res.status(ready?200:503).json({status:ready?'ready':'not-ready',database,redis,mode:{database:persistenceMode,redis:cacheMode}});
};
app.get('/ready',readinessHandler);
app.get('/api/system/ready',readinessHandler);

app.post('/api/auth/register',async(req,res)=>{
  const body=registerSchema.parse(req.body);
  if(users.some(u=>u.email===body.email)) return res.status(409).json({message:'Email already registered'});
  const user:User={id:randomUUID(),name:body.name,email:body.email,avatar_url:null,password_hash:await bcrypt.hash(body.password,10)};
  users.push(user);
  const workspace:Workspace={id:randomUUID(),name:`${body.name}'s Workspace`,description:'Personal TeamPulse workspace',owner_id:user.id};
  workspaces.push(workspace); memberships.push({workspace_id:workspace.id,user_id:user.id,role:'admin'}); queuePersist();
  res.status(201).json({token:signToken(user),user:{id:user.id,name:user.name,email:user.email,avatar_url:user.avatar_url},workspace});
});

app.post('/api/auth/login',async(req,res)=>{
  const body=credentialsSchema.parse(req.body);
  const user=users.find(u=>u.email===body.email);
  if(!user || !(await bcrypt.compare(body.password,user.password_hash))) return res.status(401).json({message:'Invalid email or password'});
  const safe={id:user.id,name:user.name,email:user.email,avatar_url:user.avatar_url};
  res.json({token:signToken(safe),user:safe});
});

app.use('/api',authRequired);

app.get('/api/me',(req:AuthedRequest,res)=>{
  const user=users.find(u=>u.id===req.user!.id);
  if(!user) return res.status(404).json({message:'User not found'});
  res.json({id:user.id,name:user.name,email:user.email,avatar_url:user.avatar_url});
});

app.get('/api/workspaces',(req:AuthedRequest,res)=>{
  const rows=memberships.filter(m=>m.user_id===req.user!.id).map(m=>{
    const w=workspaces.find(x=>x.id===m.workspace_id)!;
    return {...w,role:m.role,project_count:projects.filter(p=>p.workspace_id===w.id).length};
  });
  res.json(rows);
});

app.post('/api/workspaces',(req:AuthedRequest,res)=>{
  const body=workspaceSchema.parse(req.body);
  const workspace:Workspace={id:randomUUID(),name:body.name,description:body.description??'',owner_id:req.user!.id};
  workspaces.push(workspace); memberships.push({workspace_id:workspace.id,user_id:req.user!.id,role:'admin'}); queuePersist();
  res.status(201).json({...workspace,role:'admin',project_count:0});
});

app.get('/api/workspaces/:workspaceId/projects',(req:AuthedRequest,res)=>{
  if(!requireWorkspace(req,res,routeParam(req.params.workspaceId))) return;
  res.json(projects.filter(p=>p.workspace_id===routeParam(req.params.workspaceId)).map(p=>({
    ...p,
    task_count:tasks.filter(t=>t.project_id===p.id).length,
    done_count:tasks.filter(t=>t.project_id===p.id&&t.status==='Done').length,
    blocked_count:tasks.filter(t=>t.project_id===p.id&&t.status==='Blocked').length
  })));
});

app.post('/api/workspaces/:workspaceId/projects',(req:AuthedRequest,res)=>{
  if(!requireWorkspace(req,res,routeParam(req.params.workspaceId),['admin','manager'])) return;
  const body=projectSchema.parse(req.body);
  const project:Project={id:randomUUID(),workspace_id:routeParam(req.params.workspaceId),name:body.name,description:body.description??'',status:body.status,priority:body.priority,owner_id:req.user!.id};
  projects.push(project); logActivity(project.workspace_id,req.user!.id,'project',project.id,'created project',{name:project.name});
  res.status(201).json({...project,task_count:0,done_count:0,blocked_count:0});
});

app.get('/api/workspaces/:workspaceId/dashboard',(req:AuthedRequest,res)=>{
  if(!requireWorkspace(req,res,routeParam(req.params.workspaceId))) return;
  const ps=projects.filter(p=>p.workspace_id===routeParam(req.params.workspaceId));
  const ids=new Set(ps.map(p=>p.id));
  const ts=tasks.filter(t=>ids.has(t.project_id));
  const weekAgo=Date.now()-7*86400000;
  res.json({
    stats:{
      total:ts.length,
      in_progress:ts.filter(t=>t.status==='In Progress').length,
      blocked:ts.filter(t=>t.status==='Blocked').length,
      completed_week:ts.filter(t=>t.status==='Done'&&new Date(t.updated_at).getTime()>=weekAgo).length,
      overdue:ts.filter(t=>t.due_date&&t.status!=='Done'&&new Date(t.due_date).getTime()<Date.now()).length
    },
    projects:ps.map(p=>{const pt=ts.filter(t=>t.project_id===p.id);return{id:p.id,name:p.name,status:p.status,priority:p.priority,total:pt.length,done:pt.filter(t=>t.status==='Done').length,blocked:pt.filter(t=>t.status==='Blocked').length};}),
    workload:memberships.filter(m=>m.workspace_id===routeParam(req.params.workspaceId)).map(m=>{const u=users.find(x=>x.id===m.user_id)!;return{id:u.id,name:u.name,active:ts.filter(t=>t.assignee_id===u.id&&t.status!=='Done').length};})
  });
});


app.get('/api/workspaces/:workspaceId/planning',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId);
  if(!requireWorkspace(req,res,workspaceId)) return;
  const projectIds=new Set(projects.filter(p=>p.workspace_id===workspaceId).map(p=>p.id));
  const workspaceTasks=tasks.filter(t=>projectIds.has(t.project_id));
  const sprintPayload=sprints.filter(s=>s.workspace_id===workspaceId).map(s=>{
    const sprintTasks=workspaceTasks.filter(t=>t.sprint_id===s.id);
    const totalPoints=sprintTasks.reduce((sum,t)=>sum+(t.story_points??0),0);
    const completedPoints=sprintTasks.filter(t=>t.status==='Done').reduce((sum,t)=>sum+(t.story_points??0),0);
    return {
      ...s,
      task_count:sprintTasks.length,
      completed_count:sprintTasks.filter(t=>t.status==='Done').length,
      blocked_count:sprintTasks.filter(t=>t.status==='Blocked').length,
      total_points:totalPoints,
      completed_points:completedPoints
    };
  });
  const backlog=workspaceTasks.filter(t=>!t.sprint_id).map(t=>({
    ...t,
    project_name:projects.find(p=>p.id===t.project_id)?.name??'Project',
    assignee_name:users.find(u=>u.id===t.assignee_id)?.name??null
  }));
  res.json({sprints:sprintPayload,backlog});
});

app.post('/api/workspaces/:workspaceId/sprints',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId);
  if(!requireWorkspace(req,res,workspaceId,['admin','manager'])) return;
  const body=sprintSchema.parse(req.body);
  const sprint:Sprint={id:randomUUID(),workspace_id:workspaceId,name:body.name,goal:body.goal??'',status:'Planned',start_date:body.startDate??null,end_date:body.endDate??null,created_at:now()};
  sprints.push(sprint);
  logActivity(workspaceId,req.user!.id,'sprint',sprint.id,'created sprint',{name:sprint.name});
  io.to(`workspace:${workspaceId}`).emit('sprint.updated',sprint);
  res.status(201).json({...sprint,task_count:0,completed_count:0,blocked_count:0,total_points:0,completed_points:0});
});

app.patch('/api/sprints/:sprintId/status',(req:AuthedRequest,res)=>{
  const sprint=sprints.find(s=>s.id===routeParam(req.params.sprintId));
  if(!sprint) return res.status(404).json({message:'Sprint not found'});
  if(!requireWorkspace(req,res,sprint.workspace_id,['admin','manager'])) return;
  const {status}=sprintStatusSchema.parse(req.body);
  if(status==='Active'){
    for(const item of sprints.filter(s=>s.workspace_id===sprint.workspace_id&&s.id!==sprint.id&&s.status==='Active')) item.status='Planned';
  }
  sprint.status=status;
  logActivity(sprint.workspace_id,req.user!.id,'sprint',sprint.id,`${status.toLowerCase()} sprint`,{name:sprint.name});
  void notifyWorkspace(sprint.workspace_id,'sprint_changed',`Sprint ${sprint.name} is now ${status}`);
  io.to(`workspace:${sprint.workspace_id}`).emit('sprint.updated',sprint);
  res.json(sprint);
});

app.patch('/api/tasks/:taskId/sprint',(req:AuthedRequest,res)=>{
  const task=tasks.find(t=>t.id===routeParam(req.params.taskId));
  if(!task) return res.status(404).json({message:'Task not found'});
  const workspaceId=taskWorkspace(task)!;
  if(!requireWorkspace(req,res,workspaceId,['admin','manager'])) return;
  const {sprintId}=taskSprintSchema.parse(req.body);
  if(sprintId && !sprints.some(s=>s.id===sprintId&&s.workspace_id===workspaceId)) return res.status(400).json({message:'Sprint does not belong to this workspace'});
  task.sprint_id=sprintId;
  task.updated_at=now();
  logActivity(workspaceId,req.user!.id,'task',task.id,sprintId?'added task to sprint':'moved task to backlog',{title:task.title});
  io.to(`workspace:${workspaceId}`).emit('task.updated',task);
  res.json(task);
});

app.get('/api/sprints/:sprintId',(req:AuthedRequest,res)=>{
  const sprint=sprints.find(s=>s.id===routeParam(req.params.sprintId));
  if(!sprint) return res.status(404).json({message:'Sprint not found'});
  if(!requireWorkspace(req,res,sprint.workspace_id)) return;
  const sprintTasks=tasks.filter(t=>t.sprint_id===sprint.id).map(t=>({
    ...t,
    project_name:projects.find(p=>p.id===t.project_id)?.name??'Project',
    assignee_name:users.find(u=>u.id===t.assignee_id)?.name??null
  }));
  res.json({...sprint,tasks:sprintTasks});
});

app.get('/api/workspaces/:workspaceId/activity',(req:AuthedRequest,res)=>{
  if(!requireWorkspace(req,res,routeParam(req.params.workspaceId))) return;
  res.json(activities.filter(a=>a.workspace_id===routeParam(req.params.workspaceId)).map(a=>({...a,actor_name:users.find(u=>u.id===a.actor_id)?.name??'System'})).slice(0,50));
});

app.get('/api/workspaces/:workspaceId/members',(req:AuthedRequest,res)=>{
  if(!requireWorkspace(req,res,routeParam(req.params.workspaceId))) return;
  const projectIds=new Set(projects.filter(p=>p.workspace_id===routeParam(req.params.workspaceId)).map(p=>p.id));
  res.json(memberships.filter(m=>m.workspace_id===routeParam(req.params.workspaceId)).map(m=>{const u=users.find(x=>x.id===m.user_id)!;return{id:u.id,name:u.name,email:u.email,avatar_url:u.avatar_url,role:m.role,active_tasks:tasks.filter(t=>projectIds.has(t.project_id)&&t.assignee_id===u.id&&t.status!=='Done').length};}));
});

app.post('/api/workspaces/:workspaceId/members',async(req:AuthedRequest,res)=>{
  if(!requireWorkspace(req,res,routeParam(req.params.workspaceId),['admin'])) return;
  const body=memberSchema.parse(req.body);
  let user=users.find(u=>u.email===body.email);
  if(!user){const generatedName=body.email.split('@')[0] || 'New member';user={id:randomUUID(),name:generatedName,email:body.email,avatar_url:null,password_hash:await bcrypt.hash('Welcome123!',10)};users.push(user);}
  const existing=memberships.find(m=>m.workspace_id===routeParam(req.params.workspaceId)&&m.user_id===user!.id);
  if(existing) existing.role=body.role as Role; else memberships.push({workspace_id:routeParam(req.params.workspaceId),user_id:user.id,role:body.role as Role});
  logActivity(routeParam(req.params.workspaceId),req.user!.id,'member',user.id,'added member',{name:user.name,role:body.role});
  res.status(201).json({id:user.id,name:user.name,email:user.email,avatar_url:user.avatar_url,role:body.role,active_tasks:0});
});

app.get('/api/projects/:projectId/tasks',(req:AuthedRequest,res)=>{
  const project=projects.find(p=>p.id===routeParam(req.params.projectId)); if(!project) return res.status(404).json({message:'Project not found'});
  if(!requireWorkspace(req,res,project.workspace_id)) return;
  res.json(tasks.filter(t=>t.project_id===project.id).map(t=>({...t,assignee_name:users.find(u=>u.id===t.assignee_id)?.name??null,reporter_name:users.find(u=>u.id===t.reporter_id)?.name??null})));
});

app.post('/api/projects/:projectId/tasks',(req:AuthedRequest,res)=>{
  const project=projects.find(p=>p.id===routeParam(req.params.projectId)); if(!project) return res.status(404).json({message:'Project not found'});
  if(!requireWorkspace(req,res,project.workspace_id,['admin','manager'])) return;
  const body=taskSchema.parse(req.body);
  const task:Task={id:randomUUID(),project_id:project.id,sprint_id:null,title:body.title,description:body.description??'',type:body.type,status:body.status,priority:body.priority,assignee_id:body.assigneeId??null,reporter_id:req.user!.id,story_points:body.storyPoints??null,due_date:body.dueDate??null,labels:body.labels??[],updated_at:now()};
  tasks.push(task); logActivity(project.workspace_id,req.user!.id,'task',task.id,'created task',{title:task.title});
  if(task.assignee_id) void notifyWorkspace(project.workspace_id,'task_assigned',`You were assigned: ${task.title}`,task.assignee_id);
  if(task.status==='Blocked') void notifyWorkspace(project.workspace_id,'task_blocked',`Blocked task: ${task.title}`,task.assignee_id);
  io.to(`workspace:${project.workspace_id}`).emit('task.created',task);
  res.status(201).json({...task,assignee_name:users.find(u=>u.id===task.assignee_id)?.name??null,reporter_name:req.user!.name});
});

app.patch('/api/tasks/:taskId',(req:AuthedRequest,res)=>{
  const task=tasks.find(t=>t.id===routeParam(req.params.taskId)); if(!task) return res.status(404).json({message:'Task not found'});
  const workspaceId=taskWorkspace(task)!; if(!requireWorkspace(req,res,workspaceId)) return;
  const body=taskPatchSchema.parse(req.body);
  const previousStatus=task.status;
  const previousAssignee=task.assignee_id;
  if(body.title!==undefined)task.title=body.title;
  if(body.description!==undefined)task.description=body.description;
  if(body.type!==undefined)task.type=body.type;
  if(body.status!==undefined)task.status=body.status;
  if(body.priority!==undefined)task.priority=body.priority;
  if(body.assigneeId!==undefined)task.assignee_id=body.assigneeId??null;
  if(body.storyPoints!==undefined)task.story_points=body.storyPoints??null;
  if(body.dueDate!==undefined)task.due_date=body.dueDate??null;
  if(body.labels!==undefined)task.labels=body.labels;
  task.updated_at=now();
  logActivity(workspaceId,req.user!.id,'task',task.id,'updated task',{title:task.title,status:task.status});
  if(task.assignee_id&&task.assignee_id!==previousAssignee) void notifyWorkspace(workspaceId,'task_assigned',`You were assigned: ${task.title}`,task.assignee_id);
  if(task.status==='Blocked'&&previousStatus!=='Blocked') void notifyWorkspace(workspaceId,'task_blocked',`Blocked task: ${task.title}`,task.assignee_id);
  const payload={...task,assignee_name:users.find(u=>u.id===task.assignee_id)?.name??null,reporter_name:users.find(u=>u.id===task.reporter_id)?.name??null};
  io.to(`workspace:${workspaceId}`).emit('task.updated',payload); res.json(payload);
});



app.get('/api/workspaces/:workspaceId/github/repositories',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId);
  if(!requireWorkspace(req,res,workspaceId)) return;
  res.json(githubRepositories.filter(r=>r.workspace_id===workspaceId));
});

app.post('/api/workspaces/:workspaceId/github/repositories',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId);
  if(!requireWorkspace(req,res,workspaceId,['admin','manager'])) return;
  const body=githubRepositorySchema.parse(req.body);
  const existing=githubRepositories.find(r=>r.workspace_id===workspaceId&&r.owner.toLowerCase()===body.owner.toLowerCase()&&r.repo.toLowerCase()===body.repo.toLowerCase());
  if(existing) return res.json(existing);
  const repository:GitHubRepository={id:randomUUID(),workspace_id:workspaceId,owner:body.owner,repo:body.repo,created_at:now()};
  githubRepositories.push(repository);
  logActivity(workspaceId,req.user!.id,'github_repository',repository.id,'connected repository',{repository:`${body.owner}/${body.repo}`});
  res.status(201).json(repository);
});

app.get('/api/workspaces/:workspaceId/github/insights',async(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId);
  if(!requireWorkspace(req,res,workspaceId)) return;
  const cached=await cacheGet<any>(`github-insights:${workspaceId}`);
  if(cached) return res.json(cached);
  const repos=githubRepositories.filter(r=>r.workspace_id===workspaceId);
  const snapshots:any[]=[];
  for(const repository of repos){
    try{
      const [repo, pulls, runs, commits]=await Promise.all([
        githubJson(`/repos/${repository.owner}/${repository.repo}`),
        githubJson(`/repos/${repository.owner}/${repository.repo}/pulls?state=all&per_page=30&sort=updated&direction=desc`),
        githubJson(`/repos/${repository.owner}/${repository.repo}/actions/runs?per_page=20`),
        githubJson(`/repos/${repository.owner}/${repository.repo}/commits?per_page=20`)
      ]);
      const mergedPulls=(pulls as any[]).filter(p=>p.merged_at);
      const mergeHours=mergedPulls.map(p=>Math.max(0,(new Date(p.merged_at).getTime()-new Date(p.created_at).getTime())/3600000));
      const workflowRuns=(runs.workflow_runs??[]) as any[];
      const completedRuns=workflowRuns.filter(r=>r.status==='completed');
      const successful=completedRuns.filter(r=>r.conclusion==='success').length;
      snapshots.push({
        repository_id:repository.id,
        full_name:repo.full_name,
        url:repo.html_url,
        default_branch:repo.default_branch,
        open_pull_requests:(pulls as any[]).filter(p=>p.state==='open').length,
        merged_pull_requests:mergedPulls.length,
        median_pr_lead_hours:median(mergeHours),
        ci_success_rate:completedRuns.length?Math.round(successful/completedRuns.length*100):0,
        latest_ci:workflowRuns[0]?{status:workflowRuns[0].status,conclusion:workflowRuns[0].conclusion,name:workflowRuns[0].name,updated_at:workflowRuns[0].updated_at}:null,
        commit_count:(commits as any[]).length,
        latest_commit:(commits as any[])[0]?{sha:(commits as any[])[0].sha,message:(commits as any[])[0].commit?.message,author:(commits as any[])[0].commit?.author?.name,date:(commits as any[])[0].commit?.author?.date}:null,
        pull_requests:(pulls as any[]).slice(0,10).map(p=>({number:p.number,title:p.title,state:p.state,merged_at:p.merged_at,user:p.user?.login,url:p.html_url,created_at:p.created_at,updated_at:p.updated_at})),
        recent_runs:workflowRuns.slice(0,8).map(r=>({id:r.id,name:r.name,status:r.status,conclusion:r.conclusion,branch:r.head_branch,url:r.html_url,updated_at:r.updated_at}))
      });
    }catch(error){
      snapshots.push({repository_id:repository.id,full_name:`${repository.owner}/${repository.repo}`,error:error instanceof Error?error.message:'GitHub unavailable'});
    }
  }
  const healthy=snapshots.filter(s=>!s.error);
  const payload={
    summary:{
      repositories:repos.length,
      open_pull_requests:healthy.reduce((sum,s)=>sum+s.open_pull_requests,0),
      ci_success_rate:healthy.length?Math.round(healthy.reduce((sum,s)=>sum+s.ci_success_rate,0)/healthy.length):0,
      median_pr_lead_hours:median(healthy.map(s=>s.median_pr_lead_hours).filter(Boolean))
    },
    repositories:snapshots
  };
  await cacheSet(`github-insights:${workspaceId}`,payload,60);
  res.json(payload);
});

app.post('/api/tasks/:taskId/github-link',(req:AuthedRequest,res)=>{
  const task=tasks.find(t=>t.id===routeParam(req.params.taskId));
  if(!task) return res.status(404).json({message:'Task not found'});
  const workspaceId=taskWorkspace(task)!;
  if(!requireWorkspace(req,res,workspaceId)) return;
  const body=githubTaskLinkSchema.parse(req.body);
  const repository=githubRepositories.find(r=>r.workspace_id===workspaceId&&r.owner.toLowerCase()===body.owner.toLowerCase()&&r.repo.toLowerCase()===body.repo.toLowerCase());
  if(!repository) return res.status(400).json({message:'Repository is not connected to this workspace'});
  const existing=githubTaskLinks.find(l=>l.task_id===task.id&&l.repository_id===repository.id&&l.pull_number===body.pullNumber);
  if(existing) return res.json(existing);
  const link:GitHubTaskLink={task_id:task.id,repository_id:repository.id,pull_number:body.pullNumber,created_at:now()};
  githubTaskLinks.push(link);
  logActivity(workspaceId,req.user!.id,'github_pull_request',String(body.pullNumber),'linked pull request',{task:task.title,repository:`${body.owner}/${body.repo}`,pullNumber:body.pullNumber});
  res.status(201).json(link);
});

app.get('/api/tasks/:taskId/github-links',async(req:AuthedRequest,res)=>{
  const task=tasks.find(t=>t.id===routeParam(req.params.taskId));
  if(!task) return res.status(404).json({message:'Task not found'});
  const workspaceId=taskWorkspace(task)!;
  if(!requireWorkspace(req,res,workspaceId)) return;
  const links=githubTaskLinks.filter(l=>l.task_id===task.id);
  const result=[];
  for(const link of links){
    const repository=githubRepositories.find(r=>r.id===link.repository_id);
    if(!repository) continue;
    try{
      const pull=await githubJson(`/repos/${repository.owner}/${repository.repo}/pulls/${link.pull_number}`);
      result.push({...link,repository:`${repository.owner}/${repository.repo}`,title:pull.title,state:pull.state,merged:!!pull.merged_at,url:pull.html_url,author:pull.user?.login});
    }catch{
      result.push({...link,repository:`${repository.owner}/${repository.repo}`,title:`PR #${link.pull_number}`,state:'unknown',merged:false,url:`https://github.com/${repository.owner}/${repository.repo}/pull/${link.pull_number}`});
    }
  }
  res.json(result);
});

app.get('/api/tasks/:taskId/time',(req:AuthedRequest,res)=>{
  const task=tasks.find(t=>t.id===routeParam(req.params.taskId));
  if(!task) return res.status(404).json({message:'Task not found'});
  const workspaceId=taskWorkspace(task)!;
  if(!requireWorkspace(req,res,workspaceId)) return;
  res.json(timeEntries.filter(e=>e.task_id===task.id).map(e=>({
    ...e,
    user_name:users.find(u=>u.id===e.user_id)?.name??'Unknown'
  })));
});

app.post('/api/tasks/:taskId/time',(req:AuthedRequest,res)=>{
  const task=tasks.find(t=>t.id===routeParam(req.params.taskId));
  if(!task) return res.status(404).json({message:'Task not found'});
  const workspaceId=taskWorkspace(task)!;
  if(!requireWorkspace(req,res,workspaceId)) return;
  const body=timeEntrySchema.parse(req.body);
  const entry:TimeEntry={
    id:randomUUID(),task_id:task.id,user_id:req.user!.id,minutes:body.minutes,
    note:body.note??'',spent_at:body.spentAt??now().slice(0,10),created_at:now()
  };
  timeEntries.unshift(entry);
  logActivity(workspaceId,req.user!.id,'time_entry',entry.id,'logged time',{task:task.title,minutes:entry.minutes});
  io.to(`workspace:${workspaceId}`).emit('time.logged',{...entry,user_name:req.user!.name});
  res.status(201).json({...entry,user_name:req.user!.name});
});

app.patch('/api/workspaces/:workspaceId/capacity/:userId',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId);
  const userId=routeParam(req.params.userId);
  if(!requireWorkspace(req,res,workspaceId,['admin','manager'])) return;
  if(!memberships.some(m=>m.workspace_id===workspaceId&&m.user_id===userId)) return res.status(404).json({message:'Member not found'});
  const body=capacitySchema.parse(req.body);
  const current=capacities.find(c=>c.workspace_id===workspaceId&&c.user_id===userId);
  if(current) current.weekly_minutes=body.weeklyMinutes; else capacities.push({workspace_id:workspaceId,user_id:userId,weekly_minutes:body.weeklyMinutes});
  logActivity(workspaceId,req.user!.id,'capacity',userId,'updated capacity',{weeklyMinutes:body.weeklyMinutes});
  res.json({user_id:userId,weekly_minutes:body.weeklyMinutes});
});

app.get('/api/workspaces/:workspaceId/analytics',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId);
  if(!requireWorkspace(req,res,workspaceId)) return;
  const projectIds=new Set(projects.filter(p=>p.workspace_id===workspaceId).map(p=>p.id));
  const workspaceTasks=tasks.filter(t=>projectIds.has(t.project_id));
  const sprintRows=sprints.filter(s=>s.workspace_id===workspaceId).map(s=>{
    const sprintTasks=workspaceTasks.filter(t=>t.sprint_id===s.id);
    const completed=sprintTasks.filter(t=>t.status==='Done');
    const plannedPoints=sprintTasks.reduce((sum,t)=>sum+(t.story_points??0),0);
    const deliveredPoints=completed.reduce((sum,t)=>sum+(t.story_points??0),0);
    const loggedMinutes=timeEntries.filter(e=>sprintTasks.some(t=>t.id===e.task_id)).reduce((sum,e)=>sum+e.minutes,0);
    const start=s.start_date?new Date(s.start_date):null;
    const end=s.end_date?new Date(s.end_date):null;
    const totalDays=start&&end?Math.max(1,Math.ceil((end.getTime()-start.getTime())/86400000)+1):0;
    const elapsed=start?Math.max(1,Math.min(totalDays||1,Math.ceil((Date.now()-start.getTime())/86400000)+1)):0;
    const idealRemaining=plannedPoints&&totalDays?Math.max(0,Math.round(plannedPoints*(1-elapsed/totalDays))):0;
    const actualRemaining=Math.max(0,plannedPoints-deliveredPoints);
    return {...s,planned_points:plannedPoints,delivered_points:deliveredPoints,logged_minutes:loggedMinutes,ideal_remaining:idealRemaining,actual_remaining:actualRemaining};
  });

  const memberRows=memberships.filter(m=>m.workspace_id===workspaceId).map(m=>{
    const user=users.find(u=>u.id===m.user_id)!;
    const memberTasks=workspaceTasks.filter(t=>t.assignee_id===user.id&&t.status!=='Done');
    const memberEntries=timeEntries.filter(e=>e.user_id===user.id&&workspaceTasks.some(t=>t.id===e.task_id));
    const weeklyMinutes=capacities.find(c=>c.workspace_id===workspaceId&&c.user_id===user.id)?.weekly_minutes??1800;
    const loggedMinutes=memberEntries.reduce((sum,e)=>sum+e.minutes,0);
    const plannedPoints=memberTasks.reduce((sum,t)=>sum+(t.story_points??0),0);
    return {id:user.id,name:user.name,role:m.role,weekly_minutes:weeklyMinutes,logged_minutes:loggedMinutes,active_tasks:memberTasks.length,planned_points:plannedPoints,utilization:Math.min(100,Math.round((loggedMinutes/weeklyMinutes)*100))};
  });

  const completed=workspaceTasks.filter(t=>t.status==='Done');
  const avgCycleHours=completed.length?Math.round(completed.reduce((sum,t)=>sum+Math.max(1,(Date.now()-new Date(t.updated_at).getTime())/3600000),0)/completed.length):0;
  const totalLogged=timeEntries.filter(e=>workspaceTasks.some(t=>t.id===e.task_id)).reduce((sum,e)=>sum+e.minutes,0);

  res.json({
    summary:{total_logged_minutes:totalLogged,completed_tasks:completed.length,average_cycle_hours:avgCycleHours,active_sprint:sprintRows.find(s=>s.status==='Active')?.name??null},
    velocity:sprintRows.filter(s=>s.status==='Completed'||s.status==='Active').map(s=>({sprint:s.name,planned:s.planned_points,delivered:s.delivered_points})),
    sprints:sprintRows,
    capacity:memberRows
  });
});

app.get('/api/tasks/:taskId/comments',(req:AuthedRequest,res)=>{
  const task=tasks.find(t=>t.id===routeParam(req.params.taskId)); if(!task) return res.status(404).json({message:'Task not found'});
  const workspaceId=taskWorkspace(task)!; if(!requireWorkspace(req,res,workspaceId)) return;
  res.json(comments.filter(c=>c.task_id===task.id).map(c=>({...c,user_name:users.find(u=>u.id===c.user_id)?.name??'Unknown'})));
});

app.post('/api/tasks/:taskId/comments',(req:AuthedRequest,res)=>{
  const task=tasks.find(t=>t.id===routeParam(req.params.taskId)); if(!task) return res.status(404).json({message:'Task not found'});
  const workspaceId=taskWorkspace(task)!; if(!requireWorkspace(req,res,workspaceId)) return;
  const body=commentSchema.parse(req.body);
  const comment:Comment={id:randomUUID(),task_id:task.id,user_id:req.user!.id,body:body.body,created_at:now()}; comments.push(comment);
  logActivity(workspaceId,req.user!.id,'comment',comment.id,'commented on task',{title:task.title});
  const payload={...comment,user_name:req.user!.name}; io.to(`workspace:${workspaceId}`).emit('comment.created',payload); res.status(201).json(payload);
});

app.get('/api/workspaces/:workspaceId/search',(req:AuthedRequest,res)=>{
  if(!requireWorkspace(req,res,routeParam(req.params.workspaceId))) return;
  const q=String(req.query.q??'').toLowerCase().trim(); if(!q) return res.json([]);
  const result:any[]=[];
  for(const p of projects.filter(p=>p.workspace_id===routeParam(req.params.workspaceId)&&p.name.toLowerCase().includes(q))) result.push({kind:'project',id:p.id,title:p.name,subtitle:p.status});
  const pids=new Set(projects.filter(p=>p.workspace_id===routeParam(req.params.workspaceId)).map(p=>p.id));
  for(const t of tasks.filter(t=>pids.has(t.project_id)&&t.title.toLowerCase().includes(q))) result.push({kind:'task',id:t.id,title:t.title,subtitle:t.status});
  for(const m of memberships.filter(m=>m.workspace_id===routeParam(req.params.workspaceId))){const u=users.find(x=>x.id===m.user_id)!;if(u.name.toLowerCase().includes(q)||u.email.includes(q))result.push({kind:'member',id:u.id,title:u.name,subtitle:u.email});}
  res.json(result.slice(0,20));
});



app.get('/api/workspaces/:workspaceId/permissions',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId);
  const role=requireWorkspace(req,res,workspaceId); if(!role)return;
  res.json({role,permissions:rolePermissions[role]});
});

app.patch('/api/workspaces/:workspaceId/members/:userId/role',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId); if(!requirePermission(req,res,workspaceId,'member.manage'))return;
  const membership=memberships.find(m=>m.workspace_id===workspaceId&&m.user_id===routeParam(req.params.userId));
  if(!membership)return res.status(404).json({message:'Member not found'});
  const body=roleUpdateSchema.parse(req.body);
  if(membership.user_id===workspaces.find(w=>w.id===workspaceId)?.owner_id&&body.role!=='admin')return res.status(400).json({message:'Workspace owner must remain admin'});
  const previous=membership.role; membership.role=body.role; queuePersist();
  logActivity(workspaceId,req.user!.id,'membership',membership.user_id,'changed member role',{from:previous,to:body.role});
  res.json(membership);
});

app.get('/api/workspaces/:workspaceId/audit',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId); if(!requirePermission(req,res,workspaceId,'audit.view'))return;
  const entity=String(req.query.entity??'').trim(); const actor=String(req.query.actor??'').trim();
  const rows=activities.filter(a=>a.workspace_id===workspaceId)
    .filter(a=>!entity||a.entity_type===entity).filter(a=>!actor||a.actor_id===actor)
    .slice(0,500).map(a=>({...a,actor_name:users.find(u=>u.id===a.actor_id)?.name??'System'}));
  res.json(rows);
});

app.get('/api/workspaces/:workspaceId/reports/executive',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId); if(!requireWorkspace(req,res,workspaceId))return;
  const list=workspaceTasks(workspaceId); const active=sprints.find(s=>s.workspace_id===workspaceId&&s.status==='Active');
  const done=list.filter(t=>t.status==='Done'); const blocked=list.filter(t=>t.status==='Blocked');
  const overdue=list.filter(t=>t.due_date&&t.status!=='Done'&&new Date(t.due_date).getTime()<Date.now());
  const points=list.reduce((s,t)=>s+(t.story_points??0),0); const delivered=done.reduce((s,t)=>s+(t.story_points??0),0);
  const minutes=timeEntries.filter(e=>list.some(t=>t.id===e.task_id)).reduce((s,e)=>s+e.minutes,0);
  const byPriority=['Critical','High','Medium','Low'].map(priority=>({priority,count:list.filter(t=>t.priority===priority&&t.status!=='Done').length}));
  const byStatus=['Backlog','To Do','In Progress','Blocked','Review','Done'].map(status=>({status,count:list.filter(t=>t.status===status).length}));
  res.json({generated_at:now(),summary:{total_tasks:list.length,completed_tasks:done.length,blocked_tasks:blocked.length,overdue_tasks:overdue.length,planned_points:points,delivered_points:delivered,delivery_rate:points?Math.round(delivered/points*100):0,logged_hours:Math.round(minutes/60),active_sprint:active?.name??null},by_priority:byPriority,by_status:byStatus,risks:[...blocked,...overdue].slice(0,10).map(t=>({id:t.id,title:t.title,status:t.status,priority:t.priority,due_date:t.due_date}))});
});

app.get('/api/workspaces/:workspaceId/reports/export.csv',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId); if(!requirePermission(req,res,workspaceId,'report.export'))return;
  const escape=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
  const rows=[['Task','Status','Priority','Assignee','Sprint','Story points','Due date'],
    ...workspaceTasks(workspaceId).map(t=>[t.title,t.status,t.priority,users.find(u=>u.id===t.assignee_id)?.name??'',sprints.find(s=>s.id===t.sprint_id)?.name??'',t.story_points??'',t.due_date??''])];
  res.type('text/csv').send(rows.map(r=>r.map(escape).join(',')).join('\n'));
});

app.post('/api/workspaces/:workspaceId/assistant',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId); if(!requireWorkspace(req,res,workspaceId))return;
  const body=assistantSchema.parse(req.body??{}); const list=workspaceTasks(workspaceId);
  const blocked=list.filter(t=>t.status==='Blocked'); const overdue=list.filter(t=>t.due_date&&t.status!=='Done'&&new Date(t.due_date).getTime()<Date.now());
  const unassigned=list.filter(t=>!t.assignee_id&&t.status!=='Done'); const review=list.filter(t=>t.status==='Review');
  const active=sprints.find(s=>s.workspace_id===workspaceId&&s.status==='Active');
  const insights:string[]=[];
  if(blocked.length)insights.push(`${blocked.length} blocked task(s) need attention: ${blocked.slice(0,3).map(t=>t.title).join(', ')}.`);
  if(overdue.length)insights.push(`${overdue.length} task(s) are overdue.`);
  if(review.length)insights.push(`${review.length} task(s) are waiting in review.`);
  if(unassigned.length)insights.push(`${unassigned.length} active task(s) are unassigned.`);
  if(!insights.length)insights.push('No immediate delivery risks are visible in the current workspace data.');
  const recommendations=[
    ...(blocked.length?['Resolve or re-scope blocked work before pulling additional tasks.']:[]),
    ...(overdue.length?['Reconfirm owners and dates for overdue work.']:[]),
    ...(review.length?['Clear the review queue to improve flow.']:[]),
    ...(active?[`Keep ${active.name} focused on its current goal: ${active.goal||'deliver committed work'}.`]:[])
  ];
  res.json({generated_at:now(),focus:body.focus,question:body.question,mode:'deterministic-delivery-assistant',summary:insights.join(' '),insights,recommendations,metrics:{total:list.length,blocked:blocked.length,overdue:overdue.length,in_review:review.length,unassigned:unassigned.length}});
});

app.get('/api/workspaces/:workspaceId/onboarding',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId); if(!requireWorkspace(req,res,workspaceId))return;
  const steps=[
    {key:'workspace',label:'Workspace created',complete:!!workspaces.find(w=>w.id===workspaceId)},
    {key:'team',label:'Add a teammate',complete:memberships.filter(m=>m.workspace_id===workspaceId).length>1},
    {key:'project',label:'Create a project',complete:projects.some(p=>p.workspace_id===workspaceId)},
    {key:'task',label:'Create delivery work',complete:workspaceTasks(workspaceId).length>0},
    {key:'integration',label:'Connect GitHub or Slack',complete:githubRepositories.some(r=>r.workspace_id===workspaceId)||slackIntegrations.some(s=>s.workspace_id===workspaceId&&s.enabled)}
  ];
  res.json({steps,completed:steps.filter(s=>s.complete).length,total:steps.length,percent:Math.round(steps.filter(s=>s.complete).length/steps.length*100)});
});

app.post('/api/workspaces/:workspaceId/invitations',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId); if(!requirePermission(req,res,workspaceId,'member.manage'))return;
  const body=invitationSchema.parse(req.body);
  const invitation:Invitation={id:randomUUID(),workspace_id:workspaceId,email:body.email,role:body.role,token:randomUUID(),status:'pending',invited_by:req.user!.id,created_at:now(),accepted_at:null};
  invitations.unshift(invitation); queuePersist(); logActivity(workspaceId,req.user!.id,'invitation',invitation.id,'invited member',{email:body.email,role:body.role});
  res.status(201).json({...invitation,token:undefined});
});

app.get('/api/workspaces/:workspaceId/invitations',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId); if(!requirePermission(req,res,workspaceId,'member.manage'))return;
  res.json(invitations.filter(i=>i.workspace_id===workspaceId).map(i=>({...i,token:undefined})));
});

app.get('/api/workspaces/:workspaceId/settings',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId); if(!requireWorkspace(req,res,workspaceId))return;
  const workspace=workspaces.find(w=>w.id===workspaceId)!; res.json({workspace,settings:settingsFor(workspaceId),plan:planFor(workspaceId)});
});

app.patch('/api/workspaces/:workspaceId/settings',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId); if(!requirePermission(req,res,workspaceId,'workspace.manage'))return;
  const body=workspaceSettingsSchema.parse(req.body); const workspace=workspaces.find(w=>w.id===workspaceId); if(!workspace)return res.status(404).json({message:'Workspace not found'});
  workspace.name=body.name; workspace.description=body.description; const settings=settingsFor(workspaceId); settings.timezone=body.timezone;settings.week_starts_on=body.weekStartsOn;settings.updated_at=now();
  queuePersist(); logActivity(workspaceId,req.user!.id,'workspace',workspaceId,'updated workspace settings',{timezone:body.timezone,weekStartsOn:body.weekStartsOn});
  res.json({workspace,settings,plan:planFor(workspaceId)});
});

app.get('/api/workspaces/:workspaceId/billing',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId); if(!requireWorkspace(req,res,workspaceId))return;
  const plan=planFor(workspaceId); const used=memberships.filter(m=>m.workspace_id===workspaceId).length;
  res.json({...plan,seats_used:used,features:{audit:true,exports:true,assistant:true,slack:true,github:true},checkout_enabled:false});
});


app.get('/api/workspaces/:workspaceId/metabase/embed',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId);
  if(!requireWorkspace(req,res,workspaceId))return;
  const metabaseUrl=process.env.METABASE_URL?.replace(/\/$/,'');
  const secret=process.env.METABASE_SECRET_KEY;
  const dashboardId=process.env.METABASE_DASHBOARD_ID;
  if(!metabaseUrl||!secret||!dashboardId)return res.json({configured:false,url:null});
  const payload={resource:{dashboard:Number(dashboardId)},params:{workspace_id:[workspaceId]},exp:Math.round(Date.now()/1000)+600};
  const token=jwt.sign(payload,secret);
  res.json({configured:true,url:`${metabaseUrl}/embed/dashboard/${token}#bordered=false&titled=false`});
});

app.get('/api/workspaces/:workspaceId/notification-settings',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId);
  if(!requireWorkspace(req,res,workspaceId)) return;
  const prefs=preferencesFor(workspaceId);
  const slack=slackIntegrations.find(s=>s.workspace_id===workspaceId);
  res.json({preferences:prefs,slack:{configured:!!slack?.webhook_url,enabled:slack?.enabled??false,channel_name:slack?.channel_name??null,updated_at:slack?.updated_at??null}});
});

app.patch('/api/workspaces/:workspaceId/notification-preferences',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId);
  if(!requireWorkspace(req,res,workspaceId,['admin','manager'])) return;
  const body=notificationPreferencesSchema.parse(req.body);
  const prefs=preferencesFor(workspaceId);
  Object.assign(prefs,{
    task_assigned:body.taskAssigned,task_blocked:body.taskBlocked,task_overdue:body.taskOverdue,
    sprint_changed:body.sprintChanged,ci_failed:body.ciFailed,daily_digest:body.dailyDigest,slack_enabled:body.slackEnabled
  });
  queuePersist();
  res.json(prefs);
});

app.put('/api/workspaces/:workspaceId/slack',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId);
  if(!requireWorkspace(req,res,workspaceId,['admin'])) return;
  const body=slackIntegrationSchema.parse(req.body);
  let integration=slackIntegrations.find(s=>s.workspace_id===workspaceId);
  if(!integration){
    integration={workspace_id:workspaceId,webhook_url:body.webhookUrl??null,channel_name:body.channelName??null,enabled:body.enabled,updated_at:now()};
    slackIntegrations.push(integration);
  }else{
    if(body.webhookUrl!==undefined) integration.webhook_url=body.webhookUrl;
    if(body.channelName!==undefined) integration.channel_name=body.channelName;
    integration.enabled=body.enabled; integration.updated_at=now();
  }
  preferencesFor(workspaceId).slack_enabled=body.enabled;
  queuePersist();
  res.json({configured:!!integration.webhook_url,enabled:integration.enabled,channel_name:integration.channel_name,updated_at:integration.updated_at});
});

app.post('/api/workspaces/:workspaceId/slack/test',async(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId);
  if(!requireWorkspace(req,res,workspaceId,['admin','manager'])) return;
  const sent=await sendSlack(workspaceId,`*TeamPulse Slack test* · ${workspaces.find(w=>w.id===workspaceId)?.name??'Workspace'} is connected.`);
  if(!sent) return res.status(400).json({message:'Slack is not configured or enabled'});
  res.json({sent:true});
});

app.post('/api/workspaces/:workspaceId/automations/run',async(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId);
  if(!requireWorkspace(req,res,workspaceId,['admin','manager'])) return;
  const body=automationRunSchema.parse(req.body??{});
  res.json(await runWorkspaceAutomation(workspaceId,body.includeDigest));
});

app.get('/api/workspaces/:workspaceId/automation-history',(req:AuthedRequest,res)=>{
  const workspaceId=routeParam(req.params.workspaceId);
  if(!requireWorkspace(req,res,workspaceId)) return;
  res.json(automationEvents.filter(e=>e.workspace_id===workspaceId).slice(0,100));
});

app.get('/api/notifications',(req:AuthedRequest,res)=>res.json(notifications.filter(n=>n.user_id===req.user!.id).slice(0,100)));

app.patch('/api/notifications/:notificationId/read',(req:AuthedRequest,res)=>{
  const item=notifications.find(n=>n.id===routeParam(req.params.notificationId)&&n.user_id===req.user!.id);
  if(!item) return res.status(404).json({message:'Notification not found'});
  item.read_at=now(); queuePersist(); res.json(item);
});


app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  console.error(error);
  const message=error instanceof Error?error.message:'Unexpected error';
  res.status(message.includes('validation')||message.includes('Invalid')?400:500).json({message});
});

await initPersistence();
const persisted=await loadState<PersistedState>();
if(persisted) restoreState(persisted);
else { await seed(); await saveState(snapshotState()); }
server.listen(port,'0.0.0.0',()=>console.log(`TeamPulse API listening on :${port} [db=${persistenceMode}, redis=${cacheMode}]`));
const automationIntervalMs=Math.max(3600000,Number(process.env.AUTOMATION_INTERVAL_MS??3600000));
setInterval(()=>{void runAllAutomations().catch(error=>console.error('automation run failed',error));},automationIntervalMs);
setTimeout(()=>{void runAllAutomations().catch(error=>console.error('initial automation run failed',error));},15000);
