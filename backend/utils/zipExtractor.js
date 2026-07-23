/**
 * ZIP File Extractor Utility
 * Extracts ZIP files and processes contents
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');

/**
 * Extract ZIP file and return extracted file information
 * @param {string} zipFilePath - Path to ZIP file
 * @param {string} extractDir - Directory to extract to
 * @returns {Array} Array of extracted files with metadata
 */
async function extractZipAndProcessFiles(zipFilePath, extractDir) {
  try {
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }

    const zip = new AdmZip(zipFilePath);
    const zipEntries = zip.getEntries();
    const extractedFiles = [];

    // Extract files
    zip.extractAllTo(extractDir, true);

    // Process extracted files
    zipEntries.forEach(entry => {
      if (!entry.isDirectory) {
        const fileName = entry.name;
        const fileExt = path.extname(fileName);
        const fileSize = entry.header.size;
        
        // Create file metadata
        const fileMetadata = {
          title: path.basename(fileName),
          originalName: fileName,
          filename: path.basename(fileName),
          path: path.join(extractDir, fileName),
          url: `/uploads/projects/extracted/${path.basename(fileName)}`,
          type: getFileType(fileExt),
          mimeType: getMimeType(fileExt),
          size: fileSize,
          extension: fileExt,
          extractedAt: new Date()
        };

        extractedFiles.push(fileMetadata);
        console.log(`[ZipExtractor] Processed file: ${fileName}`);
      }
    });

    // Delete original ZIP file after extraction
    fs.unlinkSync(zipFilePath);
    console.log(`[ZipExtractor] ZIP file deleted: ${zipFilePath}`);

    return {
      success: true,
      filesCount: extractedFiles.length,
      files: extractedFiles,
      message: `Successfully extracted ${extractedFiles.length} files`
    };
  } catch (error) {
    console.error('[ZipExtractor] Error extracting ZIP:', error);
    // Clean up on error
    if (fs.existsSync(zipFilePath)) {
      fs.unlinkSync(zipFilePath);
    }
    throw new Error(`Failed to extract ZIP file: ${error.message}`);
  }
}

/**
 * Get file type based on extension
 */
function getFileType(ext) {
  const typeMap = {
    '.pdf': 'pdf',
    '.doc': 'document',
    '.docx': 'document',
    '.txt': 'document',
    '.md': 'document',
    '.js': 'code',
    '.ts': 'code',
    '.jsx': 'code',
    '.tsx': 'code',
    '.py': 'code',
    '.java': 'code',
    '.cpp': 'code',
    '.c': 'code',
    '.html': 'code',
    '.css': 'code',
    '.json': 'code',
    '.xml': 'code',
    '.yaml': 'code',
    '.yml': 'code',
    '.sql': 'code',
    '.sh': 'code',
    '.png': 'image',
    '.jpg': 'image',
    '.jpeg': 'image',
    '.gif': 'image',
    '.svg': 'image',
    '.webp': 'image',
    '.figma': 'design',
    '.xd': 'design',
    '.psd': 'design',
    '.sketch': 'design',
  };

  return typeMap[ext.toLowerCase()] || 'file';
}

/**
 * Get MIME type based on extension
 */
function getMimeType(ext) {
  const mimeMap = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.js': 'application/javascript',
    '.ts': 'text/typescript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.html': 'text/html',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  };

  return mimeMap[ext.toLowerCase()] || 'application/octet-stream';
}

/**
 * Clean up extracted files
 */
function cleanupExtractedFiles(extractDir) {
  try {
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
      console.log(`[ZipExtractor] Cleaned up directory: ${extractDir}`);
    }
  } catch (error) {
    console.error('[ZipExtractor] Error cleaning up files:', error);
  }
}

module.exports = {
  extractZipAndProcessFiles,
  cleanupExtractedFiles,
  getFileType,
  getMimeType
};
