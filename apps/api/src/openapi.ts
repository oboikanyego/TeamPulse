export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'TeamPulse API',
    version: '5.0.0',
    description: 'REST API for TeamPulse workspaces, projects, delivery planning, tasks, team collaboration and realtime delivery operations.'
  },
  servers: [
    { url: '/api', description: 'Current environment' },
    { url: 'https://teampulse-api-bk.onrender.com/api', description: 'Production' }
  ],
  tags: [
    { name: 'Auth' }, { name: 'Workspaces' }, { name: 'Projects' }, { name: 'Sprints' },
    { name: 'Tasks' }, { name: 'Team' }, { name: 'Comments' }, { name: 'Dashboard' },
    { name: 'Search' }, { name: 'Notifications' }, { name: 'Time Tracking' }, { name: 'Analytics' }, { name: 'GitHub' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    },
    schemas: {
      User: { type: 'object', properties: { id:{type:'string',format:'uuid'}, name:{type:'string'}, email:{type:'string',format:'email'}, avatar_url:{type:'string',nullable:true} } },
      Workspace: { type:'object', properties:{ id:{type:'string',format:'uuid'}, name:{type:'string'}, description:{type:'string'}, role:{type:'string',enum:['admin','manager','member']}, project_count:{type:'integer'} } },
      Project: { type:'object', properties:{ id:{type:'string',format:'uuid'}, workspace_id:{type:'string',format:'uuid'}, name:{type:'string'}, description:{type:'string'}, status:{type:'string',enum:['Planning','Active','At Risk','Completed','Archived']}, priority:{type:'string',enum:['Low','Medium','High','Critical']} } },
      Sprint: { type:'object', properties:{ id:{type:'string',format:'uuid'}, workspace_id:{type:'string',format:'uuid'}, name:{type:'string'}, goal:{type:'string'}, status:{type:'string',enum:['Planned','Active','Completed']}, start_date:{type:'string',nullable:true}, end_date:{type:'string',nullable:true}, task_count:{type:'integer'}, completed_count:{type:'integer'}, blocked_count:{type:'integer'}, total_points:{type:'integer'}, completed_points:{type:'integer'} } },
      Task: { type:'object', properties:{ id:{type:'string',format:'uuid'}, project_id:{type:'string',format:'uuid'}, sprint_id:{type:'string',format:'uuid',nullable:true}, title:{type:'string'}, description:{type:'string'}, type:{type:'string',enum:['Feature','Bug','Task','Improvement','Spike']}, status:{type:'string',enum:['Backlog','To Do','In Progress','Blocked','Review','Done']}, priority:{type:'string',enum:['Low','Medium','High','Critical']}, assignee_id:{type:'string',format:'uuid',nullable:true}, story_points:{type:'integer',nullable:true}, due_date:{type:'string',nullable:true}, labels:{type:'array',items:{type:'string'}} } },
      Comment: { type:'object', properties:{ id:{type:'string',format:'uuid'}, task_id:{type:'string',format:'uuid'}, user_id:{type:'string',format:'uuid'}, user_name:{type:'string'}, body:{type:'string'}, created_at:{type:'string',format:'date-time'} } },
      TimeEntry: { type:'object', properties:{ id:{type:'string',format:'uuid'}, task_id:{type:'string',format:'uuid'}, user_id:{type:'string',format:'uuid'}, user_name:{type:'string'}, minutes:{type:'integer'}, note:{type:'string'}, spent_at:{type:'string'}, created_at:{type:'string',format:'date-time'} } },
      Error: { type:'object', properties:{ message:{type:'string'} } }
    }
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/auth/register': {
      post: { tags:['Auth'], security:[], summary:'Register a user and create their first workspace', requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['name','email','password'],properties:{name:{type:'string'},email:{type:'string',format:'email'},password:{type:'string',minLength:8}}}}}}, responses:{'201':{description:'Registered'},'409':{description:'Email already registered'}} }
    },
    '/auth/login': {
      post: { tags:['Auth'], security:[], summary:'Login and receive a JWT', requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['email','password'],properties:{email:{type:'string',format:'email'},password:{type:'string'}}}}}}, responses:{'200':{description:'Authenticated'},'401':{description:'Invalid credentials'}} }
    },
    '/me': { get:{tags:['Auth'],summary:'Get current user',responses:{'200':{description:'Current user'}}} },
    '/workspaces': {
      get:{tags:['Workspaces'],summary:'List workspaces for current user',responses:{'200':{description:'Workspace list'}}},
      post:{tags:['Workspaces'],summary:'Create a workspace',requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['name'],properties:{name:{type:'string'},description:{type:'string'}}}}}},responses:{'201':{description:'Workspace created'}}}
    },
    '/workspaces/{workspaceId}/projects': {
      parameters:[{name:'workspaceId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],
      get:{tags:['Projects'],summary:'List projects in a workspace',responses:{'200':{description:'Project list'}}},
      post:{tags:['Projects'],summary:'Create a project',description:'Requires admin or manager role.',requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['name'],properties:{name:{type:'string'},description:{type:'string'},status:{type:'string'},priority:{type:'string'}}}}}},responses:{'201':{description:'Project created'},'403':{description:'Insufficient role'}}}
    },
    '/workspaces/{workspaceId}/planning': {
      get:{tags:['Sprints'],summary:'Get sprint planning board and unassigned backlog',parameters:[{name:'workspaceId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],responses:{'200':{description:'Planning board'}}}
    },
    '/workspaces/{workspaceId}/sprints': {
      post:{tags:['Sprints'],summary:'Create a sprint',description:'Requires admin or manager role.',parameters:[{name:'workspaceId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['name'],properties:{name:{type:'string'},goal:{type:'string'},startDate:{type:'string',nullable:true},endDate:{type:'string',nullable:true}}}}}},responses:{'201':{description:'Sprint created'}}}
    },
    '/sprints/{sprintId}': {
      get:{tags:['Sprints'],summary:'Get sprint with assigned tasks',parameters:[{name:'sprintId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],responses:{'200':{description:'Sprint details'},'404':{description:'Not found'}}}
    },
    '/sprints/{sprintId}/status': {
      patch:{tags:['Sprints'],summary:'Change sprint lifecycle status',description:'Starting a sprint demotes any other active sprint in the workspace back to Planned.',parameters:[{name:'sprintId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['status'],properties:{status:{type:'string',enum:['Planned','Active','Completed']}}}}}},responses:{'200':{description:'Sprint updated'}}}
    },
    '/projects/{projectId}/tasks': {
      parameters:[{name:'projectId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],
      get:{tags:['Tasks'],summary:'List tasks for a project',responses:{'200':{description:'Task list'}}},
      post:{tags:['Tasks'],summary:'Create a task',description:'Requires admin or manager role.',requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['title'],properties:{title:{type:'string'},description:{type:'string'},type:{type:'string'},status:{type:'string'},priority:{type:'string'},assigneeId:{type:'string',nullable:true},storyPoints:{type:'integer',nullable:true},dueDate:{type:'string',nullable:true},labels:{type:'array',items:{type:'string'}}}}}}},responses:{'201':{description:'Task created'}}}
    },
    '/tasks/{taskId}': {
      patch:{tags:['Tasks'],summary:'Update a task',parameters:[{name:'taskId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/Task'}}}},responses:{'200':{description:'Task updated'}}}
    },
    '/tasks/{taskId}/sprint': {
      patch:{tags:['Sprints','Tasks'],summary:'Assign or remove a task from a sprint',description:'Pass null to return the task to backlog. Requires admin or manager role.',parameters:[{name:'taskId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['sprintId'],properties:{sprintId:{type:'string',format:'uuid',nullable:true}}}}}},responses:{'200':{description:'Task updated'}}}
    },
    '/tasks/{taskId}/time': {
      parameters:[{name:'taskId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],
      get:{tags:['Time Tracking'],summary:'List time entries for a task',responses:{'200':{description:'Time entry list'}}},
      post:{tags:['Time Tracking'],summary:'Log time against a task',requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['minutes'],properties:{minutes:{type:'integer',minimum:1,maximum:1440},note:{type:'string'},spentAt:{type:'string',nullable:true}}}}}},responses:{'201':{description:'Time logged'}}}
    },
    '/workspaces/{workspaceId}/analytics': {
      get:{tags:['Analytics'],summary:'Get velocity, burndown, cycle-time and capacity analytics',parameters:[{name:'workspaceId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],responses:{'200':{description:'Delivery analytics'}}}
    },
    '/workspaces/{workspaceId}/capacity/{userId}': {
      patch:{tags:['Analytics'],summary:'Update a member weekly capacity',description:'Requires admin or manager role.',parameters:[{name:'workspaceId',in:'path',required:true,schema:{type:'string',format:'uuid'}},{name:'userId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['weeklyMinutes'],properties:{weeklyMinutes:{type:'integer',minimum:60,maximum:10080}}}}}},responses:{'200':{description:'Capacity updated'}}}
    },
    '/tasks/{taskId}/comments': {
      parameters:[{name:'taskId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],
      get:{tags:['Comments'],summary:'List comments for a task',responses:{'200':{description:'Comment list'}}},
      post:{tags:['Comments'],summary:'Add a comment',requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['body'],properties:{body:{type:'string'}}}}}},responses:{'201':{description:'Comment created'}}}
    },
    '/workspaces/{workspaceId}/members': {
      parameters:[{name:'workspaceId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],
      get:{tags:['Team'],summary:'List workspace members and workload',responses:{'200':{description:'Member list'}}},
      post:{tags:['Team'],summary:'Add or update a workspace member',description:'Requires admin role.',requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['email','role'],properties:{email:{type:'string',format:'email'},role:{type:'string',enum:['admin','manager','member']}}}}}},responses:{'201':{description:'Member added'}}}
    },
    '/workspaces/{workspaceId}/dashboard': {
      get:{tags:['Dashboard'],summary:'Get delivery KPIs and workload',parameters:[{name:'workspaceId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],responses:{'200':{description:'Dashboard'}}}
    },
    '/workspaces/{workspaceId}/activity': {
      get:{tags:['Dashboard'],summary:'Get recent workspace activity',parameters:[{name:'workspaceId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],responses:{'200':{description:'Activity feed'}}}
    },
    '/workspaces/{workspaceId}/search': {
      get:{tags:['Search'],summary:'Search projects, tasks and members',parameters:[{name:'workspaceId',in:'path',required:true,schema:{type:'string',format:'uuid'}},{name:'q',in:'query',required:true,schema:{type:'string'}}],responses:{'200':{description:'Search results'}}}
    },
    '/workspaces/{workspaceId}/github/repositories': {
      get:{tags:['GitHub'],summary:'List connected GitHub repositories',parameters:[{name:'workspaceId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],responses:{'200':{description:'Repository list'}}},
      post:{tags:['GitHub'],summary:'Connect a GitHub repository',description:'Requires admin or manager role.',parameters:[{name:'workspaceId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['owner','repo'],properties:{owner:{type:'string'},repo:{type:'string'}}}}}},responses:{'201':{description:'Repository connected'}}}
    },
    '/workspaces/{workspaceId}/github/insights': {
      get:{tags:['GitHub'],summary:'Get live pull request, commit and GitHub Actions engineering insights',parameters:[{name:'workspaceId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],responses:{'200':{description:'Engineering insights'}}}
    },
    '/tasks/{taskId}/github-link': {
      post:{tags:['GitHub','Tasks'],summary:'Link a pull request to a task',parameters:[{name:'taskId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['owner','repo','pullNumber'],properties:{owner:{type:'string'},repo:{type:'string'},pullNumber:{type:'integer',minimum:1}}}}}},responses:{'201':{description:'Pull request linked'}}}
    },
    '/tasks/{taskId}/github-links': {
      get:{tags:['GitHub','Tasks'],summary:'List GitHub pull requests linked to a task',parameters:[{name:'taskId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],responses:{'200':{description:'Linked pull requests'}}}
    },
    '/notifications': { get:{tags:['Notifications'],summary:'List notifications for the current user',responses:{'200':{description:'Notification list'}}} }
  }
} as const;
