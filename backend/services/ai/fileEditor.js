const fs = require('fs').promises;
const path = require('path');

class FileEditor {
  getWorkspaceBasePath(projectId) {
    // Corrected path to point to backend/uploads/workspaces
    return path.normalize(path.join(__dirname, `../../uploads/workspaces/${projectId}`));
  }

  async writeFile(projectId, filePath, content) {
    const basePath = this.getWorkspaceBasePath(projectId);
    const fullPath = path.normalize(path.join(basePath, filePath));

    // Security check: ensure path is inside workspace
    if (!fullPath.startsWith(basePath)) {
      throw new Error("Access Denied: Path outside workspace");
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');
    
    return { 
      success: true, 
      path: filePath, 
      fullPath: fullPath 
    };
  }

  async readFile(projectId, filePath) {
    const basePath = this.getWorkspaceBasePath(projectId);
    const fullPath = path.normalize(path.join(basePath, filePath));

    if (!fullPath.startsWith(basePath)) {
      throw new Error("Access Denied: Path outside workspace");
    }

    return await fs.readFile(fullPath, 'utf8');
  }
}

module.exports = new FileEditor();
