import { useState } from 'react';
import lit from './lit';
import './App.css';

const noAuthError = "The access control condition check failed!";

function App() {

  const [file, setFile] = useState(null);
  const [encryptedFile, setEncryptedFile] = useState(null);
  const [encryptedSymmetricKey, setEncryptedSymmetricKey] = useState(null);
  const [fileSize, setFileSize] = useState(0);

  const selectFile = (e) => {
    setFile(e.target.files[0]);
    setEncryptedFile(null);
    setEncryptedSymmetricKey(null);
    setFileSize(0);
  }

  const encryptFile = async () => {
    if (file === null) {
      alert("Please select a file before encrypting!");
      return;
    }

    const { encryptedFile, encryptedSymmetricKey } = await lit.encryptFile(file);
    setEncryptedFile(encryptedFile);
    setEncryptedSymmetricKey(encryptedSymmetricKey);
    setFileSize(0);
  }

  const decryptFile = async () => {
    if (encryptedFile === null) {
      alert("Please encrypt your file first!");
      return;
    }

    try {
      const decrypted = await lit.decryptFile(encryptedFile, encryptedSymmetricKey);
      setFileSize(decrypted.byteLength);
    } catch (error) {
      alert(noAuthError);
    }
  }

  return (
    <div className="App">
        <h1>Encrypt & Decrypt a file using Lit SDK</h1>
        <input type="file" name="file" onChange={selectFile} />
        <div>
          <button onClick={encryptFile}>Encrypt</button>
          <button onClick={decryptFile}>Decrypt</button>
        </div>
        {(encryptedFile !== null && fileSize === 0) && (
          <h3>File Encrypted: {file.name}. Thanks for using Lit!</h3>
        )}
        {fileSize > 0 && (
          <h3>File Decrypted: {file.name} of {fileSize} bytes</h3>
        )}
    </div>
  );
}

export default App;
