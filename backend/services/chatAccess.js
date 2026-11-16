/**
 * Who may read/write the message thread between one student and their mentor for a project.
 * Models are injected so the rules can be unit tested without a database.
 */
const isObjectId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

async function canAccessThread({ user, projectId, studentId }, { Project, Center, Progress }) {
  projectId = String(projectId || '');
  studentId = String(studentId || '');
  if (!isObjectId(projectId) || !isObjectId(studentId) || !user) return { allowed: false };

  const uid = String(user.id || user._id);
  const roles = user.roles || [];

  const enrollment = await Progress.findOne({ projectId, studentId }).select('assignedMentorId');
  if (!enrollment) return { allowed: false };

  if (roles.includes('admin')) return { allowed: true, role: 'admin' };

  if (roles.includes('student') && uid === studentId) return { allowed: true, role: 'student' };

  if (roles.includes('mentor')) {
    if (enrollment.assignedMentorId && String(enrollment.assignedMentorId) === uid) {
      return { allowed: true, role: 'mentor' };
    }
    const project = await Project.findById(projectId).select('mentor_id centerId');
    if (project && project.mentor_id && String(project.mentor_id) === uid) {
      return { allowed: true, role: 'mentor' };
    }
  }

  if (roles.includes('center_admin')) {
    const project = await Project.findById(projectId).select('centerId');
    const center = project ? await Center.findById(project.centerId).select('admin_id') : null;
    if (center && String(center.admin_id) === uid) return { allowed: true, role: 'center_admin' };
  }
  return { allowed: false };
}

const threadRoom = (projectId, studentId) => `thread:${projectId}:${studentId}`;

module.exports = { canAccessThread, threadRoom, isObjectId };
