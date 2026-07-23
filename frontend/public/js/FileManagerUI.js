/**
 * FileManagerUI Component
 * Manages file tree, CRUD operations, and workspace integration
 */

class FileManagerUI {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.projectId = options.projectId;
    this.baseUrl = options.baseUrl || '/api/workspaces';
    this.token = options.token || localStorage.getItem('token');
    this.onFileSelect = options.onFileSelect || (() => {});
    this.onError = options.onError || console.error;
    
    this.currentPath = '';
    this.files = [];
    this.selectedFile = null;
    
    this.init();
  }

  async init() {
    this.render();
    await this.loadFiles();
    // Attach tree event delegation to the container
    this.attachTreeEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="file-manager">
        <div class="file-manager-header">
          <h3>📁 Files</h3>
          <div class="file-manager-actions">
            <button class="btn-icon" id="fm-new-file" title="New File">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </button>
            <button class="btn-icon" id="fm-new-folder" title="New Folder">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            <button class="btn-icon" id="fm-upload" title="Upload File">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </button>
            <button class="btn-icon" id="fm-upload-zip" title="Upload ZIP & Extract">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M21 8a2 2 0 0 0-2-2h-8l-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
            </button>
            <button class="btn-icon" id="fm-refresh" title="Refresh">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="file-tree" id="file-tree" style="overflow-y:auto; overflow-x:hidden; min-height: 0; flex: 1;">

          <div class="loading">Loading files...</div>
        </div>

        <input type="file" id="fm-file-input" style="display:none" />
        <input type="file" id="fm-zip-input" accept=".zip,application/zip" style="display:none" />
      </div>

      <!-- Context Menu -->
      <div id="file-context-menu" class="context-menu" style="display:none">
        <div class="context-menu-item" data-action="open">Open</div>
        <div class="context-menu-item" data-action="rename">Rename</div>
        <div class="context-menu-item" data-action="delete">Delete</div>
        <div class="context-menu-item" data-action="download">Download</div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    // Toolbar actions
    document.getElementById('fm-new-file').addEventListener('click', () => this.createNewFile());
    document.getElementById('fm-new-folder').addEventListener('click', () => this.createNewFolder());
    document.getElementById('fm-upload').addEventListener('click', () => this.uploadFile());
    document.getElementById('fm-upload-zip').addEventListener('click', () => this.uploadZipAndExtract());
    document.getElementById('fm-refresh').addEventListener('click', () => this.loadFiles());

    // File input
    document.getElementById('fm-file-input').addEventListener('change', (e) => this.handleFileUpload(e));
    document.getElementById('fm-zip-input').addEventListener('change', (e) => this.handleZipUpload(e));

    // Hide context menu on click outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.context-menu')) {
        this.hideContextMenu();
      }
    });

    // Context menu actions
    document.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        this.handleContextAction(action);
      });
    });
  }

  async loadFiles() {
    this.ensureToken();
    try {
      // First, try to get workspace files
      let workspaceFiles = [];
      try {
        const response = await fetch(`${this.baseUrl}/${this.projectId}/files`, {
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          workspaceFiles = data.files || [];
        }
      } catch (error) {
        console.warn('Failed to load workspace files:', error);
      }

      // Now, also load project assets
      let projectAssets = [];
      try {
        const assetResponse = await fetch(`/api/projects/${this.projectId}`, {
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        });

        if (assetResponse.ok) {
          const projectData = await assetResponse.json();
          // Convert assets to file format for display
          if (projectData.assets && Array.isArray(projectData.assets)) {
            projectAssets = projectData.assets.map(asset => ({
              id: asset.title || asset.originalName,
              name: asset.title || asset.originalName || asset.filename,
              path: `📦_Assets/${asset.title || asset.originalName || asset.filename}`,
              type: 'file',
              size: asset.size || 0,
              mimeType: asset.mimeType,
              url: asset.url,
              isAsset: true
            }));
          }
        }
      } catch (error) {
        console.warn('Failed to load project assets:', error);
      }

      // Combine workspace files and project assets
      this.files = [...workspaceFiles, ...projectAssets];

      // If no files at all, use default structure
      if (this.files.length === 0) {
        console.warn('No files found, using default structure');
        this.files = [
          {
            id: 'index-html',
            name: 'index.html',
            path: 'index.html',
            type: 'file',
            content: '<!DOCTYPE html>\n<html>\n<head>\n  <title>My Project</title>\n</head>\n<body>\n  <h1>Hello World!</h1>\n</body>\n</html>'
          },
          {
            id: 'style-css',
            name: 'style.css',
            path: 'style.css',
            type: 'file',
            content: 'body {\n  font-family: Arial, sans-serif;\n  margin: 0;\n  padding: 20px;\n}'
          },
          {
            id: 'script-js',
            name: 'script.js',
            path: 'script.js',
            type: 'file',
            content: 'console.log("Hello World!");'
          }
        ];
      }

      this.renderFileTree();
    } catch (error) {
      console.error('Error loading files:', error);
      // Use default structure on error
      this.files = [
        {
          id: 'index-html',
          name: 'index.html',
          path: 'index.html',
          type: 'file',
          content: '<!DOCTYPE html>\n<html>\n<head>\n  <title>My Project</title>\n</head>\n<body>\n  <h1>Hello World!</h1>\n</body>\n</html>'
        }
      ];
      this.renderFileTree();
    }
  }

  renderFileTree() {
    const tree = this.buildTree(this.files);
    const treeContainer = document.getElementById('file-tree');
    treeContainer.innerHTML = this.renderTreeNode(tree, '');
  }

  buildTree(files) {
    const tree = { name: 'root', type: 'folder', children: [], path: '' };
    
    files.forEach(file => {
      const parts = file.path.split('/');
      let current = tree;
      
      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1;
        let child = current.children.find(c => c.name === part);
        
        if (!child) {
          child = {
            name: part,
            type: isLast ? file.type : 'folder',
            path: parts.slice(0, index + 1).join('/'),
            size: isLast ? file.size : 0,
            children: [],
            // Preserve asset metadata if this is the final file
            ...(isLast && file.isAsset ? { 
              isAsset: true, 
              url: file.url, 
              mimeType: file.mimeType 
            } : {})
          };
          current.children.push(child);
        }
        
        current = child;
      });
    });

    // Sort: folders first, then files, alphabetically
    this.sortTree(tree);
    return tree;
  }

  sortTree(node) {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(child => this.sortTree(child));
    }
  }

  renderTreeNode(node, indent = '') {
    if (node.name === 'root') {
      return node.children.map(child => this.renderTreeNode(child, '')).join('');
    }

    const isFolder = node.type === 'folder';
    const icon = isFolder ? '📁' : this.getFileIcon(node.name);
    const hasChildren = node.children && node.children.length > 0;
    const isAsset = node.isAsset;
    
    let html = `
      <div class="tree-node ${isFolder ? 'folder' : 'file'}" 
           data-path="${node.path}" 
           data-type="${node.type}"
           style="padding-left: ${indent.length * 20}px">
        <span class="tree-node-toggle ${hasChildren ? 'has-children' : ''}" data-path="${node.path}">
          ${hasChildren ? '▶' : ''}
        </span>
        <span class="tree-node-icon">${icon}</span>
        <span class="tree-node-name">${node.name}</span>
        ${!isFolder ? `<span class="tree-node-size">${this.formatSize(node.size)}</span>` : ''}
        ${isAsset && node.url ? `<span class="tree-node-action" style="margin-left: 8px; cursor: pointer; color: #0e639c; font-weight: bold;" onclick="window.open('${node.url}', '_blank')" title="Download">📥</span>` : ''}
      </div>
      ${hasChildren ? `<div class="tree-children" data-parent="${node.path}" style="display:none">
        ${node.children.map(child => this.renderTreeNode(child, indent + '  ')).join('')}
      </div>` : ''}
    `;

    return html;
  }

  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
      'html': '🌐',
      'css': '🎨',
      'js': '📜',
      'json': '📋',
      'md': '📝',
      'txt': '📄',
      'py': '🐍',
      'java': '☕',
      'cpp': '⚙️',
      'c': '⚙️',
      'zip': '📦',
      'pdf': '📕',
      'png': '🖼️',
      'jpg': '🖼️',
      'svg': '🖼️'
    };
    return icons[ext] || '📄';
  }

  formatSize(bytes) {
    if (bytes === 0) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // Attach event delegation for tree interactions (non-destructive)
  attachTreeEvents() {
    if (this._treeEventsAttached) return;
    this._treeEventsAttached = true;

    // Use event delegation on container
    this.container.addEventListener('click', (e) => {
      const toggle = e.target.closest('.tree-node-toggle');
      if (toggle && toggle.textContent.trim()) {
        this.toggleFolder(toggle.dataset.path);
        return;
      }

      const node = e.target.closest('.tree-node');
      if (node) {
        if (e.button === 2 || e.ctrlKey) {
          // Right click or Ctrl+Click
          e.preventDefault();
          this.showContextMenu(e, node.dataset.path);
        } else {
          // Left click
          this.selectFile(node.dataset.path, node.dataset.type);
        }
      }
    });

    // Right click
    this.container.addEventListener('contextmenu', (e) => {
      const node = e.target.closest('.tree-node');
      if (node) {
        e.preventDefault();
        this.showContextMenu(e, node.dataset.path);
      }
    });
  }

  toggleFolder(path) {
    const children = document.querySelector(`.tree-children[data-parent="${path}"]`);
    const toggle = document.querySelector(`.tree-node-toggle[data-path="${path}"]`);
    
    if (children && toggle) {
      const isOpen = children.style.display !== 'none';
      children.style.display = isOpen ? 'none' : 'block';
      toggle.textContent = isOpen ? '▶' : '▼';
    }
  }

  async selectFile(path, type) {
    if (type === 'folder') {
      this.toggleFolder(path);
      return;
    }

    this.selectedFile = path;
    
    // Highlight selected
    document.querySelectorAll('.tree-node').forEach(node => node.classList.remove('selected'));
    document.querySelector(`.tree-node[data-path="${path}"]`)?.classList.add('selected');

    // Check if file exists locally first
    const localFile = this.files.find(f => f.path === path);

    // Project assets are not stored under /api/workspaces files path.
    // Open binary assets directly and avoid workspace file-content fetch.
    if (localFile && localFile.isAsset) {
      const assetName = localFile.name || path.split('/').pop();
      const assetType = localFile.mimeType || 'application/octet-stream';

      // IMPORTANT: Do not auto-open assets in a new tab when selecting them.
      // Embedded/extracted asset apps may reference runtime files that Nexus doesn't serve.




      this.onFileSelect({
        path,
        content: `Asset: ${assetName}\nType: ${assetType}\nThis is a project asset. Use the download option if needed.`,
        type: 'file'
      });
      return;
    }

    if (localFile && localFile.content !== undefined) {
      // Use local content
      this.onFileSelect({
        path: localFile.path,
        content: localFile.content,
        type: localFile.type
      });
      return;
    }

    // Load file content from API
    try {
      const response = await fetch(`${this.baseUrl}/${this.projectId}/files/${path}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (!response.ok) {
        console.warn('File not found on server, using empty content');
        // Use empty content as fallback
        this.onFileSelect({
          path: path,
          content: '',
          type: 'file'
        });
        return;
      }

      const data = await response.json();
      this.onFileSelect(data);
    } catch (error) {
      console.error('Error loading file:', error);
      // Use empty content as fallback
      this.onFileSelect({
        path: path,
        content: '',
        type: 'file'
      });
    }
  }

  showContextMenu(event, path) {
    this.selectedFile = path;
    const menu = document.getElementById('file-context-menu');
    menu.style.display = 'block';
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
  }

  hideContextMenu() {
    document.getElementById('file-context-menu').style.display = 'none';
  }

  async handleContextAction(action) {
    this.hideContextMenu();
    
    switch (action) {
      case 'open':
        const node = document.querySelector(`.tree-node[data-path="${this.selectedFile}"]`);
        if (node) this.selectFile(this.selectedFile, node.dataset.type);
        break;
      case 'rename':
        await this.renameFile();
        break;
      case 'delete':
        await this.deleteFile();
        break;
      case 'download':
        await this.downloadFile();
        break;
    }
  }

  async createNewFile() {
    const filename = prompt('Enter file name (e.g., index.html):');
    if (!filename) return;

    const path = this.currentPath ? `${this.currentPath}/${filename}` : filename;

    try {
      const response = await fetch(`${this.baseUrl}/${this.projectId}/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          filePath: path,
          isFolder: false,
          content: ''
        })
      });

      if (!response.ok) {
        console.warn('File API not available, creating file locally');
        // Create file locally only
        const newFile = {
          id: Date.now().toString(),
          name: filename,
          path: path,
          type: 'file',
          content: ''
        };
        this.files.push(newFile);
        this.renderFileTree();
        this.selectFile(path, 'file');
        return;
      }

      await this.loadFiles();
      this.selectFile(path, 'file');
    } catch (error) {
      console.error('Error creating file:', error);
      // Create file locally as fallback
      const newFile = {
        id: Date.now().toString(),
        name: filename,
        path: path,
        type: 'file',
        content: ''
      };
      this.files.push(newFile);
      this.renderFileTree();
      this.selectFile(path, 'file');
    }
  }

  async createNewFolder() {
    const folderName = prompt('Enter folder name:');
    if (!folderName) return;

    const path = this.currentPath ? `${this.currentPath}/${folderName}` : folderName;

    try {
      const response = await fetch(`${this.baseUrl}/${this.projectId}/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          filePath: path,
          isFolder: true
        })
      });

      if (!response.ok) throw new Error('Failed to create folder');

      await this.loadFiles();
    } catch (error) {
      this.onError(error);
      this.showNotification('Failed to create folder: ' + error.message, 'error');
    }
  }

  uploadFile() {
    document.getElementById('fm-file-input').click();
  }

  uploadZipAndExtract() {
    document.getElementById('fm-zip-input').click();
  }

  async handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // ZIP files should use extract endpoint, not regular file upload.
    if ((file.name || '').toLowerCase().endsWith('.zip')) {
      event.target.value = '';
      await this.uploadZipFile(file);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', this.currentPath);

    try {
      const response = await fetch(`${this.baseUrl}/${this.projectId}/files`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`
        },
        body: formData
      });

      if (!response.ok) throw new Error('Failed to upload file');

      await this.loadFiles();
      event.target.value = ''; // Reset input
    } catch (error) {
      this.onError(error);
      this.showNotification('Failed to upload file: ' + error.message, 'error');
    }
  }

  async handleZipUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    await this.uploadZipFile(file);
    event.target.value = '';
  }

  async uploadZipFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${this.baseUrl}/${this.projectId}/upload-zip`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`
        },
        body: formData
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Failed to extract ZIP');
      }

      await this.loadFiles();
      this.showNotification(`ZIP extracted successfully (${data.workspace?.fileCount || 'updated'} files)`, 'success');
    } catch (error) {
      this.onError(error);
      this.showNotification('Failed to extract ZIP: ' + error.message, 'error');
    }
  }

  async renameFile() {
    if (!this.selectedFile) return;

    const oldName = this.selectedFile.split('/').pop();
    const newName = prompt('Enter new name:', oldName);
    if (!newName || newName === oldName) return;

    const pathParts = this.selectedFile.split('/');
    pathParts[pathParts.length - 1] = newName;
    const newPath = pathParts.join('/');

    try {
      const response = await fetch(`${this.baseUrl}/${this.projectId}/files/${this.selectedFile}/rename`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ newPath })
      });

      if (!response.ok) throw new Error('Failed to rename file');

      await this.loadFiles();
    } catch (error) {
      this.onError(error);
      this.showNotification('Failed to rename: ' + error.message, 'error');
    }
  }

  async deleteFile() {
    if (!this.selectedFile) return;

    if (!confirm(`Delete ${this.selectedFile}?`)) return;

    // Ensure token is available
    this.ensureToken();
    if (!this.token) {
      this.showNotification('Not authenticated. Please log in again.', 'error');
      return;
    }

    try {
      const response = await fetch(`${this.baseUrl}/${this.projectId}/files/${this.selectedFile}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.showNotification('Session expired. Please log in again.', 'error');
          return;
        }
        throw new Error('Failed to delete file');
      }

      this.selectedFile = null;
      await this.loadFiles();
      this.onFileSelect({ filePath: '', content: '' }); // Clear editor
    } catch (error) {
      this.onError(error);
      this.showNotification('Failed to delete: ' + error.message, 'error');
    }
  }

  async downloadFile() {
    if (!this.selectedFile) return;
    this.ensureToken();

    // Check if this file is an asset with a download URL
    const selectedItem = this.files.find(f => f.path === this.selectedFile);
    if (selectedItem && selectedItem.isAsset && selectedItem.url) {
      // Direct download for assets - use the stored URL
      const a = document.createElement('a');
      a.href = selectedItem.url;
      a.download = selectedItem.name || this.selectedFile.split('/').pop();
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      this.showNotification('Download started for asset', 'success');
      return;
    }

    // Check if file exists locally with content
    const localFile = this.files.find(f => f.path === this.selectedFile);
    if (localFile && localFile.content !== undefined && localFile.content !== null) {
      // Use local content directly - no API call needed
      const blob = new Blob([localFile.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.selectedFile.split('/').pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.showNotification('File downloaded successfully', 'success');
      return;
    }

    // Fallback: fetch from API with proper error handling
    try {
      const response = await fetch(`${this.baseUrl}/${this.projectId}/files/${this.selectedFile}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.showNotification('Authentication required. Please log in again.', 'error');
          return;
        }
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const content = data.content !== undefined ? data.content : (data.text || '');
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.selectedFile.split('/').pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.showNotification('File downloaded successfully', 'success');
    } catch (error) {
      this.onError(error);
      this.showNotification('Failed to download: ' + error.message, 'error');
    }
  }

  async saveFile(path, content) {
    try {

      const response = await fetch(`${this.baseUrl}/${this.projectId}/files/${path}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ content })
      });

      if (!response.ok) throw new Error('Failed to save file');

      return true;
    } catch (error) {
      this.onError(error);
      return false;
    }
  }

  setCurrentPath(path) {
    this.currentPath = path;
  }

  getSelectedFile() {
    return this.selectedFile;
  }

  destroy() {
    this.container.innerHTML = '';
  }

  // Refresh token from localStorage before API calls
  ensureToken() {
    const stored = localStorage.getItem('token');
    if (stored && stored !== this.token) {
      this.token = stored;
    }
    return this.token;
  }

  // Toast notification helper
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
      color: white;
      border-radius: 8px;
      z-index: 10000;
      animation: slideInRight 0.3s ease-out;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FileManagerUI;
}
