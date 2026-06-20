export const uploadFileToDrive = async (file: File | Blob, fileName: string, accessToken: string): Promise<string> => {
  // Step 1: Create file metadata
  const metadataRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: fileName }),
  });
  
  if (!metadataRes.ok) {
    throw new Error('Failed to create file metadata in Google Drive');
  }
  
  const metadata = await metadataRes.json();
  const fileId = metadata.id;

  // Step 2: Upload file content
  const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error('Failed to upload file content to Google Drive');
  }

  // Return the link that can be used to view the file or download it
  // Using AlternateLink or WebViewLink if we fetch it, but let's fetch the webViewLink
  const linkRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink,webContentLink`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  
  if (!linkRes.ok) {
    return `https://drive.google.com/open?id=${fileId}`; // Fallback
  }
  
  const linkData = await linkRes.json();
  return linkData.webViewLink || linkData.webContentLink || `https://drive.google.com/open?id=${fileId}`;
};
