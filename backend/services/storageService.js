const fs = require('fs').promises;
const path = require('path');

/**
 * Storage Service - Manages file operations and storage
 * Can be extended to support cloud storage (S3, Azure Blob, etc.)
 */
class StorageService {
  constructor() {
    this.basePath = 'backend/uploads';
    this.publicPath = '/uploads'; // Served via Express static
  }

  /**
   * Save uploaded files metadata to database
   * Typically called after multer processes files
   */
  async saveFileMetadata(db, userId, files, category, relatedId = null) {
    try {
      const fileRecords = [];
      
      for (const file of files) {
        const record = {
          user_id: userId,
          original_name: file.originalname,
          stored_name: file.filename,
          file_path: `${this.publicPath}/${category}/${file.filename}`,
          file_size: file.size,
          mime_type: file.mimetype,
          category: category, // projects, mentors, documents, certificates
          related_id: relatedId, // projectId, mentorId, centerId, etc.
          uploaded_at: new Date()
        };
        
        fileRecords.push(record);
      }
      
      return fileRecords;
    } catch (error) {
      console.error('Error saving file metadata:', error);
      throw error;
    }
  }

  /**
   * Get public URL for file
   */
  getPublicUrl(filename, category) {
    return `${this.publicPath}/${category}/${filename}`;
  }

  /**
   * Get local file path
   */
  getLocalPath(filename, category) {
    return path.join(this.basePath, category, filename);
  }

  /**
   * Delete file from storage
   */
  async deleteFile(filename, category) {
    try {
      const filePath = this.getLocalPath(filename, category);
      await fs.unlink(filePath);
      console.log(`File deleted: ${filePath}`);
      return { success: true };
    } catch (error) {
      console.error(`Error deleting file ${filename}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get file info
   */
  async getFileInfo(filename, category) {
    try {
      const filePath = this.getLocalPath(filename, category);
      const stat = await fs.stat(filePath);
      
      return {
        filename,
        size: stat.size,
        created: stat.birthtime,
        modified: stat.mtime,
        url: this.getPublicUrl(filename, category)
      };
    } catch (error) {
      console.error(`Error getting file info:`, error);
      return null;
    }
  }

  /**
   * Copy file to another location
   */
  async copyFile(sourceFilename, sourceCategory, destFilename, destCategory) {
    try {
      const sourcePath = this.getLocalPath(sourceFilename, sourceCategory);
      const destPath = this.getLocalPath(destFilename, destCategory);
      
      await fs.copyFile(sourcePath, destPath);
      console.log(`File copied from ${sourcePath} to ${destPath}`);
      return { success: true, url: this.getPublicUrl(destFilename, destCategory) };
    } catch (error) {
      console.error(`Error copying file:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List files in category
   */
  async listFiles(category) {
    try {
      const dirPath = path.join(this.basePath, category);
      const files = await fs.readdir(dirPath);
      
      const fileDetails = await Promise.all(
        files.map(async (filename) => {
          const info = await this.getFileInfo(filename, category);
          return info;
        })
      );
      
      return fileDetails;
    } catch (error) {
      console.error(`Error listing files in ${category}:`, error);
      return [];
    }
  }

  /**
   * Archive old files (move to archive directory)
   */
  async archiveOldFiles(category, daysOld = 90) {
    try {
      const dirPath = path.join(this.basePath, category);
      const archivePath = path.join(this.basePath, `${category}-archive`);
      
      // Create archive directory if doesn't exist
      try {
        await fs.mkdir(archivePath, { recursive: true });
      } catch (e) {
        // Directory already exists
      }

      const files = await fs.readdir(dirPath);
      const cutoffDate = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      let archivedCount = 0;

      for (const filename of files) {
        const filePath = path.join(dirPath, filename);
        const stat = await fs.stat(filePath);
        
        if (stat.mtime.getTime() < cutoffDate) {
          const archiveFilePath = path.join(archivePath, filename);
          await fs.rename(filePath, archiveFilePath);
          archivedCount++;
        }
      }

      console.log(`Archived ${archivedCount} files from ${category}`);
      return { success: true, archived: archivedCount };
    } catch (error) {
      console.error(`Error archiving files:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFiles() {
    try {
      const tempPath = path.join(this.basePath, 'temp');
      
      try {
        const files = await fs.readdir(tempPath);
        const cutoffDate = Date.now() - (24 * 60 * 60 * 1000); // 24 hours

        for (const filename of files) {
          const filePath = path.join(tempPath, filename);
          const stat = await fs.stat(filePath);
          
          if (stat.mtime.getTime() < cutoffDate) {
            await fs.unlink(filePath);
          }
        }
      } catch (e) {
        // Temp directory doesn't exist or empty
      }

      return { success: true };
    } catch (error) {
      console.error(`Error cleaning up temp files:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate storage usage
   */
  async getStorageStats() {
    try {
      const categories = ['projects', 'mentors', 'documents', 'certificates'];
      let totalSize = 0;
      const stats = {};

      for (const category of categories) {
        const categoryPath = path.join(this.basePath, category);
        try {
          const files = await fs.readdir(categoryPath);
          let categorySize = 0;

          for (const filename of files) {
            const filePath = path.join(categoryPath, filename);
            const stat = await fs.stat(filePath);
            categorySize += stat.size;
          }

          stats[category] = {
            files: files.length,
            size: categorySize,
            sizeInMB: (categorySize / (1024 * 1024)).toFixed(2)
          };
          totalSize += categorySize;
        } catch (e) {
          stats[category] = { files: 0, size: 0, sizeInMB: '0.00' };
        }
      }

      return {
        total: {
          size: totalSize,
          sizeInMB: (totalSize / (1024 * 1024)).toFixed(2)
        },
        categories: stats
      };
    } catch (error) {
      console.error(`Error getting storage stats:`, error);
      return null;
    }
  }

  /**
   * Validate file safety (check for malicious content)
   * Basic implementation - should be extended with virus scanning
   */
  async validateFile(filePath) {
    try {
      const stat = await fs.stat(filePath);
      
      // Check file size reasonableness
      if (stat.size === 0) {
        return { valid: false, reason: 'Empty file' };
      }

      if (stat.size > 500 * 1024 * 1024) {
        return { valid: false, reason: 'File exceeds maximum size' };
      }

      // Additional checks can be added here
      // E.g., virus scanning with ClamAV, magic byte validation, etc.

      return { valid: true };
    } catch (error) {
      console.error(`Error validating file:`, error);
      return { valid: false, reason: error.message };
    }
  }
}

module.exports = new StorageService();
