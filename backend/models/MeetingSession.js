const mongoose = require('mongoose');

const meetingSessionSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
  meetingScheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MeetingSchedule',
  },
  mentorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  students: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  roomId: String,
  recordingUrl: String,
  startedAt: {
    type: Date,
    default: Date.now,
  },
  endedAt: Date,
  status: {
    type: String,
    enum: ['active', 'ended'],
    default: 'active',
  },
  duration: Number,
  isRecording: {
    type: Boolean,
    default: false,
  },
});

module.exports = mongoose.model('MeetingSession', meetingSessionSchema);
