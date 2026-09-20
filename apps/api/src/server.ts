import http from 'node:http';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { type Response } from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './openapi.js';
import { authRequired, type AuthedRequest, signToken, verifyToken, type Role } from './auth.js';
import {
  commentSchema,
  credentialsSchema,
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
type Activity = { id:string; workspace_id:string; actor_id:string|null; entity_type:string; entity_id:string|null; action:string; metadata:Record<string,unknown>; created_at:string };
type Notification = { id:string; user_id:string; message:string; read_at:string|null };

const users:User[] = [];
const workspaces:Workspace[] = [];
const memberships:Membership[] = [];
const projects:Project[] = [];
const sprints:Sprint[] = [];
const tasks:Task[] = [];
const comments:Comment[] = [];
const timeEntries:TimeEntry[] = [];
const capacities:Capacity[] = [];
const activities:Activity[] = [];
const notifications:Notification[] = [];

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
function taskWorkspace(task:Task) {
  return projects.find(p=>p.id===task.project_id)?.workspace_id ?? null;
}
function logActivity(workspaceId:string, actorId:string|null, entityType:string, entityId:string|null, action:string, metadata:Record<string,unknown>={}) {
  const item = { id:randomUUID(), workspace_id:workspaceId, actor_id:actorId, entity_type:entityType, entity_id:entityId, action, metadata, created_at:now() };
  activities.unshift(item);
  io.to(`workspace:${workspaceId}`).emit('activity.created', item);
  return item;
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
  notifications.push({id:randomUUID(),user_id:developer.id,message:'You were assigned Graph notifications',read_at:null});
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

app.get('/health',(_req,res)=>res.json({status:'ok',database:'memory-fallback',redis:'disabled'}));

app.post('/api/auth/register',async(req,res)=>{
  const body=registerSchema.parse(req.body);
  if(users.some(u=>u.email===body.email)) return res.status(409).json({message:'Email already registered'});
  const user:User={id:randomUUID(),name:body.name,email:body.email,avatar_url:null,password_hash:await bcrypt.hash(body.password,10)};
  users.push(user);
  const workspace:Workspace={id:randomUUID(),name:`${body.name}'s Workspace`,description:'Personal TeamPulse workspace',owner_id:user.id};
  workspaces.push(workspace); memberships.push({workspace_id:workspace.id,user_id:user.id,role:'admin'});
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
  workspaces.push(workspace); memberships.push({workspace_id:workspace.id,user_id:req.user!.id,role:'admin'});
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
    workload:memberships.filter(m=>m.workspace_id===routeParam(req.params.workspaceId)).map(m=>{const u=users.find(x=>x.id===m.user_id)!;return{id:u.id,name:u.name,active:ts.filter(t=>t.assignee_id===user.id&&t.status!=='Done').length};})
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
  res.json(memberships.filter(m=>m.workspace_id===routeParam(req.params.workspaceId)).map(m=>{const u=users.find(x=>x.id===m.user_id)!;return{id:u.id,name:u.name,email:u.email,avatar_url:u.avatar_url,role:m.role,active_tasks:tasks.filter(t=>projectIds.has(t.project_id)&&t.assignee_id===user.id&&t.status!=='Done').length};}));
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
  io.to(`workspace:${project.workspace_id}`).emit('task.created',task);
  res.status(201).json({...task,assignee_name:users.find(u=>u.id===task.assignee_id)?.name??null,reporter_name:req.user!.name});
});

app.patch('/api/tasks/:taskId',(req:AuthedRequest,res)=>{
  const task=tasks.find(t=>t.id===routeParam(req.params.taskId)); if(!task) return res.status(404).json({message:'Task not found'});
  const workspaceId=taskWorkspace(task)!; if(!requireWorkspace(req,res,workspaceId)) return;
  const body=taskPatchSchema.parse(req.body);
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
  const payload={...task,assignee_name:users.find(u=>u.id===task.assignee_id)?.name??null,reporter_name:users.find(u=>u.id===task.reporter_id)?.name??null};
  io.to(`workspace:${workspaceId}`).emit('task.updated',payload); res.json(payload);
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

app.get('/api/notifications',(req:AuthedRequest,res)=>res.json(notifications.filter(n=>n.user_id===req.user!.id)));

app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  console.error(error);
  const message=error instanceof Error?error.message:'Unexpected error';
  res.status(message.includes('validation')||message.includes('Invalid')?400:500).json({message});
});

await seed();
server.listen(port,'0.0.0.0',()=>console.log(`TeamPulse API listening on :${port}`));
