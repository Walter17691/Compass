// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
export const MEETING_TYPES = [
  { id:"investigation", label:"Investigation",  tag:"ACAS S1",    group:"formal", mode:"er" },
  { id:"disciplinary",  label:"Disciplinary",    tag:"ACAS S2",    group:"formal", mode:"er" },
  { id:"formal",        label:"Formal Meeting",  tag:"ERA 1996",   group:"formal", mode:"er" },
  { id:"informal",      label:"Informal / 1-1",  tag:"Best Practice", group:"formal", mode:"quick" },
  { id:"grievance",     label:"Grievance",       tag:"ACAS S6",    group:"formal", mode:"er" },
  { id:"return",        label:"Return to Work",  tag:"EqA 2010",   group:"formal", mode:"er" },
  { id:"probation",     label:"Probation Review", tag:"Development", group:"dev" },
  { id:"appraisal",     label:"Appraisal",        tag:"Development", group:"dev" },
  { id:"pip-review",    label:"PIP Review",       tag:"Development", group:"dev" },
  { id:"pdp",           label:"PDP / 1-2-1",      tag:"Development", group:"dev" },
  { id:"appeal-disciplinary", label:"Disciplinary Appeal", tag:"ACAS S5",       group:"appeal", mode:"er" },
  { id:"appeal-grievance",    label:"Grievance Appeal",    tag:"ACAS S8",       group:"appeal", mode:"er" },
  { id:"appeal-dismissal",    label:"Dismissal Appeal",    tag:"ERA 1996 s.98", group:"appeal", mode:"er" },
  { id:"redundancy-atrisk",   label:"At Risk Consultation",    tag:"ERA 1996 s.188", group:"redundancy", mode:"er" },
  { id:"redundancy-consult",  label:"Redundancy Consultation", tag:"ERA 1996 s.188", group:"redundancy", mode:"er" },
  { id:"redundancy-outcome",  label:"Redundancy Outcome",      tag:"ERA 1996 s.139", group:"redundancy", mode:"er" },
  { id:"redundancy-appeal",   label:"Redundancy Appeal",       tag:"ERA 1996 s.98",  group:"redundancy", mode:"er" },
];

// Phase 11 of the reasoning-layer build-out. New uploads default to
// "other" (no picker mid-multi-file-upload) — the category is set
// afterwards from the policy list in Settings.
export const POLICY_CATEGORIES = [
  { id:"disciplinary",      label:"Disciplinary" },
  { id:"grievance",         label:"Grievance" },
  { id:"attendance",        label:"Attendance" },
  { id:"capability",        label:"Capability" },
  { id:"probation",         label:"Probation" },
  { id:"flexible_working",  label:"Flexible Working" },
  { id:"redundancy",        label:"Redundancy" },
  { id:"family_leave",      label:"Family Leave" },
  { id:"reasonable_adjustments", label:"Reasonable Adjustments" },
  { id:"hybrid_working",    label:"Hybrid Working" },
  { id:"other",             label:"Other" },
];

// Note: ORG_SETTINGS, PORTAL, TIMELINE, AUDIT, PREDICT, GDPR, ONBOARD were
// removed here - none of them were ever referenced by a screen===SCREENS.X
// render block anywhere in the app (verified by grep before removal).
export const SCREENS = {
  HOME:"home", CASES:"cases", PREP:"prep", RECORD:"record",
  REVIEW:"review", LETTER:"letter", SETTINGS:"settings",
  DASHBOARD:"dashboard",
  TEMPLATES:"templates", WHISTLE:"whistle", PEOPLE:"people", INTAKE:"intake", CASE_VIEW:"case_view", PERSON_VIEW:"person_view",
  DEVELOP:"develop", SEARCH:"search",
  NEWSTARTER:"newstarter", OFFBOARDING:"offboarding", ERREPORT:"erreport",
  REDUNDANCY:"redundancy", WELLBEING:"wellbeing", DSAR:"dsar", TASKS:"tasks",
  CONCERNS:"concerns", ASK_COMPASS:"ask_compass", SAVE_EMAIL:"save_email",
};

// Phase 14 of the reasoning-layer build-out (manager self-service). Kept
// narrower and more neutral than the case-type list (constants.js's own
// IntakeScreen options) — a manager raising a concern is describing a
// situation, not yet classifying it into a formal case type; HR does that
// classification if/when a concern becomes a case.
export const CONCERN_TYPES = [
  { id:"conduct", label:"Conduct" },
  { id:"performance", label:"Performance" },
  { id:"attendance", label:"Attendance" },
  { id:"grievance", label:"Grievance or complaint" },
  { id:"bullying_harassment", label:"Bullying or harassment" },
  { id:"safety_welfare", label:"Safety or welfare" },
  { id:"other", label:"Other" },
];

export const SPEAKERS = { HR:"HR Manager", EMP:"Employee", NOTE:"Note" };

export const WELLBEING_RESOURCES = [
  { name:"Samaritans", contact:"116 123", note:"24/7 emotional support" },
  { name:"Mind", contact:"0300 123 3393", note:"Mental health support" },
  { name:"NHS Crisis line", contact:"111 (option 2)", note:"Mental health crisis" },
  { name:"Shout", contact:"Text SHOUT to 85258", note:"Crisis text line 24/7" },
  { name:"Employee Assistance Programme", contact:"See company handbook", note:"Confidential counselling" },
  { name:"Occupational Health", contact:"Via HR", note:"Workplace health support" },
];

export const WELLBEING_TYPES = {
  "chat": { label:"Wellbeing conversation", desc:"Informal check-in or wellbeing discussion" },
  "eap": { label:"EAP referral", desc:"Employee Assistance Programme referral" },
  "adjustment": { label:"Reasonable adjustment", desc:"Mental health-related workplace adjustment" },
  "crisis": { label:"Crisis support", desc:"Immediate mental health crisis support provided" },
  "return": { label:"Return from MH absence", desc:"Return to work following mental health absence" },
  "checkin": { label:"Follow-up check-in", desc:"Scheduled wellbeing follow-up" },
};

export const NEXT_STEPS_MAP = {
  "Investigation":   [{ step:"Issue investigation outcome letter", days:5 },{ step:"Invite to disciplinary (if evidence found)", days:5 },{ step:"Allow employee to review evidence", days:2 },{ step:"Hold disciplinary hearing", days:14 }],
  "Disciplinary":    [{ step:"Issue outcome letter", days:5 },{ step:"Inform employee of right to appeal", days:5 },{ step:"Process appeal if requested", days:15 },{ step:"Note warning on HR record", days:0 }],
  "Grievance":       [{ step:"Issue grievance outcome letter", days:5 },{ step:"Inform employee of right to appeal", days:5 },{ step:"Allow appeal hearing if requested", days:15 }],
  "Formal Meeting":  [{ step:"Issue meeting record to employee", days:5 },{ step:"Confirm agreed actions in writing", days:3 },{ step:"Schedule follow-up meeting", days:28 }],
  "Informal / 1-1":  [{ step:"Document conversation notes", days:1 },{ step:"Share agreed actions with employee", days:2 },{ step:"Schedule check-in", days:14 }],
  "Return to Work":  [{ step:"Issue return to work form", days:1 },{ step:"Confirm reasonable adjustments in writing", days:3 },{ step:"Schedule welfare review", days:28 }],
  "Probation Review":[{ step:"Send probation outcome letter", days:3 },{ step:"Confirm pass / extend / fail in writing", days:3 },{ step:"Schedule next review if extended", days:28 },{ step:"Update HR record", days:1 }],
  "Appraisal":       [{ step:"Share agreed appraisal summary with employee", days:5 },{ step:"Set objectives for next review period", days:5 },{ step:"Agree development plan", days:7 },{ step:"Schedule mid-year check-in", days:90 }],
  "PIP Review":      [{ step:"Issue PIP progress letter", days:3 },{ step:"Confirm outcome: pass / extend / escalate", days:3 },{ step:"Update PIP targets if extended", days:5 },{ step:"Schedule next review", days:28 }],
  "PDP / 1-2-1":     [{ step:"Share 1-2-1 notes with employee", days:2 },{ step:"Log agreed actions", days:1 },{ step:"Schedule next 1-2-1", days:28 }],
};

// Config for developmental meeting types
export const DEV_MEETING_CONFIG = {
  "Probation Review": {
    color:"#4A7C6F",
    selfAssessmentPrompts:[
      "How do you feel your first weeks / months have gone overall?",
      "Which parts of the role have you found most enjoyable or fulfilling?",
      "Which areas have you found most challenging?",
      "What support or training would help you most?",
      "What are your goals for the next phase?",
    ],
    managerPrompts:[
      "Overall performance against the job description and expectations",
      "Key strengths demonstrated during probation",
      "Areas requiring improvement or further development",
      "Feedback on attitude, conduct and team fit",
      "Recommendation: Pass / Extend / Fail probation",
    ],
    objectives:[
      { label:"Role competency", desc:"Meets the core requirements of the role" },
      { label:"Attendance & punctuality", desc:"Reliable and consistent attendance" },
      { label:"Team integration", desc:"Working well with colleagues and stakeholders" },
      { label:"Quality of work", desc:"Output meets required standards" },
    ],
    outcomeOptions:["Pass — probation complete","Extend — additional review in [X] weeks","Fail — employment to end"],
  },
  "Appraisal": {
    color:"#7C5CFC",
    selfAssessmentPrompts:[
      "What achievements are you most proud of this year?",
      "How would you rate your own performance against your objectives? (1-5)",
      "What skills have you developed or improved?",
      "Where do you feel you could have done better?",
      "What support do you need from your manager?",
      "What are your career aspirations for the next 12 months?",
    ],
    managerPrompts:[
      "Overall performance rating (1=Below expectations, 5=Outstanding)",
      "Assessment of each objective",
      "Key achievements and positive contributions",
      "Areas for development and improvement",
      "Recommended objectives for next year",
      "Proposed development activity or training",
    ],
    ratingScale:["1 — Below expectations","2 — Partially meets expectations","3 — Meets expectations","4 — Exceeds expectations","5 — Outstanding"],
    outcomeOptions:["Strong performer — reward / promotion discussion","Good performer — continue development","Needs improvement — support plan required","Underperforming — PIP to be considered"],
  },
  "PIP Review": {
    color:"#B87520",
    selfAssessmentPrompts:[
      "How do you feel your performance has progressed since the PIP started?",
      "Which targets do you feel you have met?",
      "Which areas are you still finding difficult, and why?",
      "What support has helped most?",
      "What do you need to fully meet the required standards?",
    ],
    managerPrompts:[
      "Progress against each PIP target (Met / Partial / Not met)",
      "Evidence of improvement or continued underperformance",
      "Quality of work and consistency",
      "Engagement and effort shown",
      "Recommendation: Pass / Extend / Escalate",
    ],
    outcomeOptions:["Pass — PIP complete, performance satisfactory","Extend — additional review period required","Escalate — further disciplinary action to be considered"],
  },
  "PDP / 1-2-1": {
    color:"#7C5CFC",
    selfAssessmentPrompts:[
      "What's going well for you at the moment?",
      "What's been most challenging since our last meeting?",
      "How are you progressing against your development goals?",
      "Is there anything blocking you that I can help with?",
      "What would you like to focus on or learn next?",
    ],
    managerPrompts:[
      "Progress update against agreed actions",
      "Observations on performance and development",
      "Coaching notes and feedback given",
      "Support offered or agreed",
      "Actions and goals for next meeting",
    ],
    outcomeOptions:["On track — continue as planned","Adjust plan — update goals or support","Flag for further review"],
  },
};

export const DEV_TEMPLATES = [
  { id:"prob-pass", cat:"Probation", name:"Probation Passed Letter", body:`Dear [Employee Name],\n\nCONFIRMATION OF SUCCESSFUL PROBATION\n\nI am delighted to confirm that you have successfully completed your probationary period with [Company Name], effective [Date].\n\nDuring your probation, you have demonstrated [key strengths]. Your contribution to the team has been valued and we look forward to your continued development.\n\nYour next appraisal will be held on [Date].\n\nCongratulations and welcome to the team.\n\nYours sincerely,\n[Manager Name]\n[Job Title]` },
  { id:"prob-extend", cat:"Probation", name:"Probation Extended Letter", body:`Dear [Employee Name],\n\nEXTENSION OF PROBATIONARY PERIOD\n\nFollowing your probation review on [Date], I am writing to confirm that your probationary period will be extended by [X weeks] until [New end date].\n\nThe reason for this extension is: [Reason]\n\nDuring this period, the following improvements are required:\n[Required improvements]\n\nThe following support will be provided:\n[Support]\n\nA further review will be held on [Date]. If the required standards are not met, your employment may be terminated.\n\nYours sincerely,\n[Manager Name]` },
  { id:"appraisal-summary", cat:"Appraisal", name:"Annual Appraisal Summary", body:`ANNUAL APPRAISAL SUMMARY\n\nEmployee: [Employee Name]\nRole: [Job Title]\nManager: [Manager Name]\nReview period: [Date] to [Date]\nOverall rating: [Rating]\n\nSUMMARY OF PERFORMANCE\n[Summary]\n\nKEY ACHIEVEMENTS\n[Achievements]\n\nAREAS FOR DEVELOPMENT\n[Development areas]\n\nOBJECTIVES FOR NEXT YEAR\n1. [Objective 1]\n2. [Objective 2]\n3. [Objective 3]\n\nDEVELOPMENT PLAN\n[Training / development agreed]\n\nEmployee comments: [Employee comments]\n\nEmployee signature: _________________ Date: _______\nManager signature:  _________________ Date: _______` },
  { id:"pdp-plan", cat:"PDP", name:"Personal Development Plan", body:`PERSONAL DEVELOPMENT PLAN\n\nEmployee: [Employee Name]\nManager: [Manager Name]\nDate: [Date]\nReview date: [Review Date]\n\nCARREER GOALS (12 months)\n[Goals]\n\nDEVELOPMENT OBJECTIVES\n\nObjective 1: [Objective]\nHow: [Actions]\nBy when: [Date]\nSuccess measure: [Measure]\n\nObjective 2: [Objective]\nHow: [Actions]\nBy when: [Date]\nSuccess measure: [Measure]\n\nObjective 3: [Objective]\nHow: [Actions]\nBy when: [Date]\nSuccess measure: [Measure]\n\nSUPPORT REQUIRED\n[Support from manager / training / resources]\n\nEmployee: _________________ Date: _______\nManager: __________________ Date: _______` },
];

export const TEMPLATES = [
  { id:"inv-disc", cat:"Disciplinary", name:"Invitation to Disciplinary Hearing", body:`Dear [Employee Name],\n\nINVITATION TO DISCIPLINARY HEARING\n\nYou are invited to attend a disciplinary hearing:\n\nDate: [Date]\nTime: [Time]\nLocation: [Location]\nChair: [Manager]\n\nAllegations to be discussed:\n[Allegations]\n\nYou have the right to be accompanied by a trade union representative or colleague. Please confirm attendance in advance.\n\nYours sincerely,\n[Manager Name]\n[Job Title]` },
  { id:"out-warn", cat:"Disciplinary", name:"First Written Warning", body:`Dear [Employee Name],\n\nOUTCOME — FIRST WRITTEN WARNING\n\nFollowing the disciplinary hearing on [Date], I am writing to confirm the outcome.\n\nFindings: [Findings]\n\nYou are issued with a FIRST WRITTEN WARNING which will remain on your file for 12 months.\n\nRequired improvement: [Improvement required]\n\nRight of appeal: You may appeal within 5 working days by writing to [Senior Manager].\n\nYours sincerely,\n[Manager Name]` },
  { id:"out-final", cat:"Disciplinary", name:"Final Written Warning", body:`Dear [Employee Name],\n\nOUTCOME — FINAL WRITTEN WARNING\n\nFollowing the disciplinary hearing on [Date]:\n\nFindings: [Findings]\n\nYou are issued with a FINAL WRITTEN WARNING. Any further breach may result in dismissal.\n\nThis warning remains on file for 12 months. You may appeal within 5 working days.\n\nYours sincerely,\n[Manager Name]` },
  { id:"out-dismiss", cat:"Disciplinary", name:"Dismissal Letter", body:`Dear [Employee Name],\n\nOUTCOME — DISMISSAL\n\nFollowing the disciplinary hearing on [Date], I regret to inform you that you are dismissed from employment with effect from [Date].\n\nReason: [Reason for dismissal]\n\nNotice/Payment in lieu: [Notice details]\nFinal pay date: [Date]\n\nYou may appeal within 5 working days by writing to [Senior Manager].\n\nYours sincerely,\n[Manager Name]` },
  { id:"inv-griev", cat:"Grievance", name:"Invitation to Grievance Hearing", body:`Dear [Employee Name],\n\nACKNOWLEDGEMENT OF GRIEVANCE\n\nThank you for your grievance dated [Date]. A hearing has been arranged:\n\nDate: [Date]  Time: [Time]  Location: [Location]  Chair: [Manager]\n\nYou have the right to be accompanied. Please bring any supporting evidence.\n\nYours sincerely,\n[Manager Name]` },
  { id:"out-griev", cat:"Grievance", name:"Grievance Outcome Letter", body:`Dear [Employee Name],\n\nGRIEVANCE OUTCOME\n\nFollowing the grievance hearing on [Date]:\n\nFindings: [Findings]\n\nOutcome: [Outcome]\n\nYou may appeal within 5 working days by writing to [Senior Manager].\n\nYours sincerely,\n[Manager Name]` },
  { id:"suspension", cat:"Investigation", name:"Suspension Letter", body:`Dear [Employee Name],\n\nNOTICE OF SUSPENSION\n\nYou are suspended from work with effect from [Date] pending investigation into [Reason].\n\nThis is a neutral act. You will continue to receive normal pay. During suspension you must not attend work or contact colleagues about this matter without authorisation.\n\nYours sincerely,\n[Manager Name]` },
  { id:"pip", cat:"Performance", name:"Performance Improvement Plan", body:`PERFORMANCE IMPROVEMENT PLAN\n\nEmployee: [Employee Name]\nManager: [Manager]\nStart: [Start Date]\nReview: [Review Date]\n\nPerformance concerns:\n[Concerns]\n\nRequired improvement & targets:\n[Targets]\n\nSupport to be provided:\n[Support]\n\nReview will take place on [Review Date]. Failure to meet targets may result in further action.\n\nEmployee: _________________ Date: _______\nManager: __________________ Date: _______` },
  { id:"occ-health", cat:"Welfare", name:"Occupational Health Referral", body:`Dear [Employee Name],\n\nOCCUPATIONAL HEALTH REFERRAL\n\nWith your consent, we wish to refer you to our Occupational Health provider.\n\nReason for referral: [Reason]\n\nThe OH advisor will assess your fitness for work and may make recommendations. Their report will be shared with HR and your manager. You may refuse this referral.\n\nYours sincerely,\n[Manager Name]` },
  { id:"inv-appeal", cat:"Appeal", name:"Invitation to Appeal Hearing", body:`Dear [Employee Name],\n\nINVITATION TO APPEAL HEARING\n\nThank you for your appeal against [Original decision].\n\nYour appeal will be heard:\nDate: [Date]  Time: [Time]  Location: [Location]\nAppeal Chair: [Manager] (who had no involvement in the original decision)\n\nYou have the right to be accompanied.\n\nYours sincerely,\n[Manager Name]` },
  { id:"return-work", cat:"Welfare", name:"Return to Work Letter", body:`Dear [Employee Name],\n\nRETURN TO WORK — CONFIRMATION\n\nWelcome back following your absence from [Start date] to [End date].\n\nWe discussed the following during your return to work meeting on [Date]:\n\nReasons for absence: [Reasons]\nAny support / adjustments agreed: [Adjustments]\nNext welfare review: [Date]\n\nPlease do not hesitate to speak to [Manager] if you need any further support.\n\nYours sincerely,\n[Manager Name]` },
];
