import { supabase } from './supabase'

// CASES
export async function getCases(userId) {
  const { data, error } = await supabase
    .from('cases')
    .select(`*, meetings(*)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) { console.error('getCases:', error); return []; }
  return data.map(c => ({
    id: c.id,
    employeeName: c.employee_name,
    employeeEmail: c.employee_email,
    createdAt: c.created_at,
    meetings: (c.meetings || []).map(mapMeeting)
  }))
}

export async function saveCase(userId, employeeName, employeeEmail) {
  const { data, error } = await supabase
    .from('cases')
    .insert({ user_id: userId, employee_name: employeeName, employee_email: employeeEmail })
    .select()
    .single()
  if (error) { console.error('saveCase:', error); return null; }
  return data.id
}

export async function updateCase(caseId, fields) {
  const { error } = await supabase
    .from('cases')
    .update({ employee_name: fields.employeeName, employee_email: fields.employeeEmail, updated_at: new Date() })
    .eq('id', caseId)
  if (error) console.error('updateCase:', error)
}

export async function deleteCase(caseId) {
  const { error } = await supabase.from('cases').delete().eq('id', caseId)
  if (error) console.error('deleteCase:', error)
}

// MEETINGS
function mapMeeting(m) {
  return {
    id: m.id,
    type: m.type,
    date: m.date,
    manager: m.manager,
    context: m.context,
    transcript: m.transcript,
    prepPack: m.prep_pack,
    structuredRecord: m.structured_record,
    riskScore: m.risk_score,
    outcomeLetter: m.outcome_letter,
    inviteLetter: m.invite_letter,
    appealLetter: m.appeal_letter,
    participants: m.participants || [],
    adjustments: m.adjustments || [],
    savedAt: m.saved_at,
  }
}

export async function saveMeeting(caseId, meeting) {
  const { data, error } = await supabase
    .from('meetings')
    .insert({
      case_id: caseId,
      type: meeting.type,
      date: meeting.date,
      manager: meeting.manager,
      context: meeting.context,
      transcript: meeting.transcript,
      prep_pack: meeting.prepPack,
      structured_record: meeting.structuredRecord,
      risk_score: meeting.riskScore,
      outcome_letter: meeting.outcomeLetter,
      invite_letter: meeting.inviteLetter,
      appeal_letter: meeting.appealLetter,
      participants: meeting.participants,
      adjustments: meeting.adjustments,
    })
    .select()
    .single()
  if (error) { console.error('saveMeeting:', error); return null; }
  return data.id
}

export async function updateMeeting(meetingId, fields) {
  const mapped = {}
  if (fields.transcript !== undefined) mapped.transcript = fields.transcript
  if (fields.prepPack !== undefined) mapped.prep_pack = fields.prepPack
  if (fields.structuredRecord !== undefined) mapped.structured_record = fields.structuredRecord
  if (fields.riskScore !== undefined) mapped.risk_score = fields.riskScore
  if (fields.outcomeLetter !== undefined) mapped.outcome_letter = fields.outcomeLetter
  if (fields.inviteLetter !== undefined) mapped.invite_letter = fields.inviteLetter
  if (fields.appealLetter !== undefined) mapped.appeal_letter = fields.appealLetter
  if (fields.participants !== undefined) mapped.participants = fields.participants
  if (fields.adjustments !== undefined) mapped.adjustments = fields.adjustments

  const { error } = await supabase.from('meetings').update(mapped).eq('id', meetingId)
  if (error) console.error('updateMeeting:', error)
}

export async function deleteMeeting(meetingId) {
  const { error } = await supabase.from('meetings').delete().eq('id', meetingId)
  if (error) console.error('deleteMeeting:', error)
}

// AUDIT
export async function addAuditEntry(userId, action, detail) {
  const { error } = await supabase
    .from('audit_log')
    .insert({ user_id: userId, action, detail })
  if (error) console.error('addAudit:', error)
}

export async function getAuditLog(userId) {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) { console.error('getAudit:', error); return []; }
  return data
}
