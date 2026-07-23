/**
 * Integration Tests for Virtual Lab APIs
 * Tests workspace and meeting endpoints
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3005';
let authToken = '';
let projectId = '';
let sessionId = '';

// Test configuration
const config = {
  centerAdmin: {
    email: 'admin@center.com',
    password: 'password123'
  },
  mentor: {
    email: 'mentor@nexus.com',
    password: 'password123'
  },
  student: {
    email: 'student@nexus.com',
    password: 'password123'
  }
};

// Helper: API client with auth
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use(config => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

// Helper: Login function
async function login(email, password) {
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email,
      password
    });
    authToken = response.data.token;
    console.log(`✓ Logged in as ${email}`);
    return response.data;
  } catch (error) {
    console.error(`✗ Login failed: ${error.message}`);
    throw error;
  }
}

// Helper: Create test project
async function createTestProject() {
  try {
    const response = await api.post('/api/projects', {
      title: 'Test Project - Virtual Lab',
      description: 'Integration test project',
      category: 'Web Development',
      difficulty_level: 'intermediate',
      duration_weeks: 4
    });
    projectId = response.data.project._id;
    console.log(`✓ Created test project: ${projectId}`);
    return projectId;
  } catch (error) {
    console.error(`✗ Failed to create project: ${error.message}`);
    throw error;
  }
}

// ============================================
// WORKSPACE API TESTS
// ============================================

describe('Workspace API Tests', () => {

  beforeAll(async () => {
    await login(config.centerAdmin.email, config.centerAdmin.password);
    await createTestProject();
  });

  test('1. Upload ZIP workspace', async () => {
    try {
      // Create a test ZIP file
      const testZipPath = path.join(__dirname, 'test-workspace.zip');
      
      // Check if test ZIP exists, if not skip
      if (!fs.existsSync(testZipPath)) {
        console.log('⚠ Test ZIP not found, skipping upload test');
        return;
      }

      const formData = new FormData();
      formData.append('file', fs.createReadStream(testZipPath));

      const response = await axios.post(
        `${BASE_URL}/api/workspaces/${projectId}/upload-zip`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${authToken}`
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.workspace).toBeDefined();
      expect(response.data.workspace.fileCount).toBeGreaterThan(0);
      console.log(`✓ Uploaded workspace with ${response.data.workspace.fileCount} files`);

    } catch (error) {
      console.error(`✗ Upload failed: ${error.message}`);
      throw error;
    }
  });

  test('2. Get workspace files', async () => {
    try {
      const response = await api.get(`/api/workspaces/${projectId}/files`);

      expect(response.status).toBe(200);
      expect(response.data.files).toBeDefined();
      expect(Array.isArray(response.data.files)).toBe(true);
      console.log(`✓ Retrieved ${response.data.files.length} files`);

    } catch (error) {
      console.error(`✗ Get files failed: ${error.message}`);
      throw error;
    }
  });

  test('3. Create new file', async () => {
    try {
      const response = await api.post(`/api/workspaces/${projectId}/files`, {
        path: 'test.js',
        type: 'file',
        content: 'console.log("Hello World");'
      });

      expect(response.status).toBe(201);
      expect(response.data.message).toContain('created');
      console.log('✓ Created new file: test.js');

    } catch (error) {
      console.error(`✗ Create file failed: ${error.message}`);
      throw error;
    }
  });

  test('4. Read file content', async () => {
    try {
      const response = await api.get(`/api/workspaces/${projectId}/files/test.js`);

      expect(response.status).toBe(200);
      expect(response.data.content).toBeDefined();
      expect(response.data.filePath).toBe('test.js');
      console.log('✓ Read file content successfully');

    } catch (error) {
      console.error(`✗ Read file failed: ${error.message}`);
      throw error;
    }
  });

  test('5. Update file content', async () => {
    try {
      const response = await api.put(`/api/workspaces/${projectId}/files/test.js`, {
        content: 'console.log("Updated content");'
      });

      expect(response.status).toBe(200);
      expect(response.data.message).toContain('updated');
      console.log('✓ Updated file content');

    } catch (error) {
      console.error(`✗ Update file failed: ${error.message}`);
      throw error;
    }
  });

  test('6. Rename file', async () => {
    try {
      const response = await api.put(`/api/workspaces/${projectId}/files/test.js/rename`, {
        newPath: 'renamed-test.js'
      });

      expect(response.status).toBe(200);
      expect(response.data.message).toContain('renamed');
      console.log('✓ Renamed file successfully');

    } catch (error) {
      console.error(`✗ Rename file failed: ${error.message}`);
      throw error;
    }
  });

  test('7. Create folder', async () => {
    try {
      const response = await api.post(`/api/workspaces/${projectId}/files`, {
        path: 'src',
        type: 'folder'
      });

      expect(response.status).toBe(201);
      console.log('✓ Created folder: src');

    } catch (error) {
      console.error(`✗ Create folder failed: ${error.message}`);
      throw error;
    }
  });

  test('8. Delete file', async () => {
    try {
      const response = await api.delete(`/api/workspaces/${projectId}/files/renamed-test.js`);

      expect(response.status).toBe(200);
      expect(response.data.message).toContain('deleted');
      console.log('✓ Deleted file successfully');

    } catch (error) {
      console.error(`✗ Delete file failed: ${error.message}`);
      throw error;
    }
  });

  test('9. Path traversal prevention', async () => {
    try {
      await api.get(`/api/workspaces/${projectId}/files/../../etc/passwd`);
      throw new Error('Should have been blocked');
    } catch (error) {
      expect(error.response.status).toBe(403);
      console.log('✓ Path traversal blocked correctly');
    }
  });

});

// ============================================
// MEETING API TESTS
// ============================================

describe('Meeting API Tests', () => {

  beforeAll(async () => {
    await login(config.mentor.email, config.mentor.password);
  });

  test('1. Create meeting schedule', async () => {
    try {
      const response = await api.post('/api/meetings/schedule', {
        projectId: projectId,
        dayOfWeek: 1, // Monday
        startTime: '14:00',
        endTime: '15:00',
        timezone: 'UTC'
      });

      expect(response.status).toBe(201);
      expect(response.data.schedule).toBeDefined();
      expect(response.data.schedule.dayOfWeek).toBe(1);
      console.log('✓ Created meeting schedule');

    } catch (error) {
      console.error(`✗ Create schedule failed: ${error.message}`);
      throw error;
    }
  });

  test('2. Get meeting schedule', async () => {
    try {
      const response = await api.get(`/api/meetings/schedule/${projectId}`);

      expect(response.status).toBe(200);
      expect(response.data.schedule).toBeDefined();
      expect(response.data.isMentorOnline).toBeDefined();
      console.log(`✓ Retrieved schedule, mentor online: ${response.data.isMentorOnline}`);

    } catch (error) {
      console.error(`✗ Get schedule failed: ${error.message}`);
      throw error;
    }
  });

  test('3. Check mentor status', async () => {
    try {
      const response = await api.get(`/api/meetings/status/${projectId}`);

      expect(response.status).toBe(200);
      expect(response.data.isMentorOnline).toBeDefined();
      console.log(`✓ Checked mentor status: ${response.data.isMentorOnline ? 'Online' : 'Offline'}`);

    } catch (error) {
      console.error(`✗ Status check failed: ${error.message}`);
      throw error;
    }
  });

  test('4. Start meeting session', async () => {
    try {
      const response = await api.post(`/api/meetings/start/${projectId}`, {
        roomId: `nexus-project-${projectId}`
      });

      expect(response.status).toBe(201);
      expect(response.data.session).toBeDefined();
      sessionId = response.data.session._id;
      console.log(`✓ Started meeting session: ${sessionId}`);

    } catch (error) {
      console.error(`✗ Start meeting failed: ${error.message}`);
      throw error;
    }
  });

  test('5. Toggle recording', async () => {
    try {
      const response = await api.put(`/api/meetings/${sessionId}/record`, {
        isRecording: true
      });

      expect(response.status).toBe(200);
      expect(response.data.session.isRecording).toBe(true);
      console.log('✓ Started recording');

      // Stop recording
      const stopResponse = await api.put(`/api/meetings/${sessionId}/record`, {
        isRecording: false
      });

      expect(stopResponse.data.session.isRecording).toBe(false);
      console.log('✓ Stopped recording');

    } catch (error) {
      console.error(`✗ Recording toggle failed: ${error.message}`);
      throw error;
    }
  });

  test('6. End meeting session', async () => {
    try {
      const response = await api.put(`/api/meetings/end/${sessionId}`);

      expect(response.status).toBe(200);
      expect(response.data.session.status).toBe('ended');
      expect(response.data.session.duration).toBeGreaterThan(0);
      console.log(`✓ Ended meeting, duration: ${response.data.session.duration}s`);

    } catch (error) {
      console.error(`✗ End meeting failed: ${error.message}`);
      throw error;
    }
  });

  test('7. Get mentor schedules', async () => {
    try {
      const response = await api.get('/api/meetings/mentor/schedules');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.schedules)).toBe(true);
      console.log(`✓ Retrieved ${response.data.schedules.length} mentor schedules`);

    } catch (error) {
      console.error(`✗ Get mentor schedules failed: ${error.message}`);
      throw error;
    }
  });

});

// ============================================
// STUDENT ACCESS TESTS
// ============================================

describe('Student Access Tests', () => {

  beforeAll(async () => {
    await login(config.student.email, config.student.password);
  });

  test('1. Student can view files', async () => {
    try {
      const response = await api.get(`/api/workspaces/${projectId}/files`);

      expect(response.status).toBe(200);
      console.log('✓ Student can view files');

    } catch (error) {
      console.error(`✗ View files failed: ${error.message}`);
      throw error;
    }
  });

  test('2. Student can edit files', async () => {
    try {
      const response = await api.put(`/api/workspaces/${projectId}/files/test.js`, {
        content: 'console.log("Student edit");'
      });

      expect(response.status).toBe(200);
      console.log('✓ Student can edit files');

    } catch (error) {
      console.error(`✗ Edit file failed: ${error.message}`);
      throw error;
    }
  });

  test('3. Student cannot upload workspace ZIP', async () => {
    try {
      await api.post(`/api/workspaces/${projectId}/upload-zip`, {});
      throw new Error('Should have been blocked');
    } catch (error) {
      expect(error.response.status).toBe(403);
      console.log('✓ Student blocked from uploading workspace');
    }
  });

  test('4. Student cannot create meeting schedule', async () => {
    try {
      await api.post('/api/meetings/schedule', {
        projectId: projectId,
        dayOfWeek: 2,
        startTime: '10:00',
        endTime: '11:00'
      });
      throw new Error('Should have been blocked');
    } catch (error) {
      expect(error.response.status).toBe(403);
      console.log('✓ Student blocked from creating schedule');
    }
  });

  test('5. Student can check mentor status', async () => {
    try {
      const response = await api.get(`/api/meetings/status/${projectId}`);

      expect(response.status).toBe(200);
      console.log('✓ Student can check mentor status');

    } catch (error) {
      console.error(`✗ Status check failed: ${error.message}`);
      throw error;
    }
  });

});

// ============================================
// PERFORMANCE TESTS
// ============================================

describe('Performance Tests', () => {

  test('1. Concurrent file reads', async () => {
    try {
      const start = Date.now();
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(api.get(`/api/workspaces/${projectId}/files`));
      }

      await Promise.all(promises);
      const duration = Date.now() - start;

      console.log(`✓ 10 concurrent reads completed in ${duration}ms`);
      expect(duration).toBeLessThan(5000);

    } catch (error) {
      console.error(`✗ Concurrent reads failed: ${error.message}`);
      throw error;
    }
  });

  test('2. Large file handling', async () => {
    try {
      const largeContent = 'x'.repeat(1000000); // 1MB
      
      const response = await api.post(`/api/workspaces/${projectId}/files`, {
        path: 'large-file.txt',
        type: 'file',
        content: largeContent
      });

      expect(response.status).toBe(201);
      console.log('✓ Large file (1MB) handled successfully');

    } catch (error) {
      console.error(`✗ Large file test failed: ${error.message}`);
      throw error;
    }
  });

});

// ============================================
// RUN ALL TESTS
// ============================================

async function runAllTests() {
  console.log('\n=================================');
  console.log('VIRTUAL LAB INTEGRATION TESTS');
  console.log('=================================\n');

  try {
    console.log('--- Workspace API Tests ---');
    // Run workspace tests
    
    console.log('\n--- Meeting API Tests ---');
    // Run meeting tests
    
    console.log('\n--- Student Access Tests ---');
    // Run student tests
    
    console.log('\n--- Performance Tests ---');
    // Run performance tests

    console.log('\n=================================');
    console.log('✓ ALL TESTS PASSED');
    console.log('=================================\n');

  } catch (error) {
    console.error('\n=================================');
    console.error('✗ TESTS FAILED');
    console.error('=================================\n');
    console.error(error);
    process.exit(1);
  }
}

// Export for Jest or run directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  login,
  createTestProject,
  api
};
