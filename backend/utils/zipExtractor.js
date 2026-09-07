/**
 * ZIP File Extractor Utility
 * Extracts ZIP files and processes contents safely.
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

async function extractZipAndProcessFiles(
  zipFilePath,
  extractDir,
  publicBaseUrl = '/uploads/projects/extracted'
) {
  try {
    fs.mkdirSync(extractDir, { recursive: true });

    const zip = new AdmZip(zipFilePath);
    const zipEntries = zip.getEntries();
    const extractedFiles = [];

    // Reject absolute paths and parent-directory traversal before extraction.
    for (const entry of zipEntries) {
      const normalized = path.posix.normalize(String(entry.entryName || '').replace(/\\/g, '/'));
      if (
        !normalized ||
        normalized.startsWith('../') ||
        normalized.includes('/../') ||
        normalized.startsWith('/') ||
        /^[A-Za-z]:\//.test(normalized)
      ) {
        throw new Error(`Unsafe ZIP entry: ${entry.entryName}`);
      }
    }

    zip.extractAllTo(extractDir, true);

    zipEntries.forEach((entry) => {
      if (entry.isDirectory) return;

      const relativeName = path.posix.normalize(String(entry.entryName).replace(/\\/g, '/'));
      const fileExt = path.extname(relativeName);
      const fileSize = entry.header.size;
      const diskPath = path.resolve(extractDir, relativeName);
      const extractRoot = path.resolve(extractDir);

      if (!diskPath.startsWith(extractRoot + path.sep)) {
        throw new Error(`Unsafe extracted path: ${relativeName}`);
      }

      extractedFiles.push({
        title: path.basename(relativeName),
        originalName: relativeName,
        filename: path.basename(relativeName),
        path: diskPath,
        url: `${publicBaseUrl.replace(/\/$/, '')}/${relativeName}`,
        type: getFileType(fileExt),
        mimeType: getMimeType(fileExt),
        size: fileSize,
        extension: fileExt,
        extractedAt: new Date(),
      });
    });

    if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);

    return {
      success: true,
      filesCount: extractedFiles.length,
      files: extractedFiles,
      message: `Successfully extracted ${extractedFiles.length} files`,
    };
  } catch (error) {
    if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
    throw new Error(`Failed to extract ZIP file: ${error.message}`);
  }
}

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

function cleanupExtractedFiles(extractDir) {
  try {
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.error('[ZipExtractor] Error cleaning up files:', error);
  }
}

module.exports = {
  extractZipAndProcessFiles,
  cleanupExtractedFiles,
  getFileType,
  getMimeType,
};
