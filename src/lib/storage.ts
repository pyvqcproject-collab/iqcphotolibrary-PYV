import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

export const uploadFileToStorage = async (file: File | Blob, fileName: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    // We upload to a qc_reports directory
    const storageRef = ref(storage, `qc_reports/${fileName}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      null,
      (error) => {
        console.warn("Storage upload failed, fallback will be triggered:", error);
        reject(error);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
};
