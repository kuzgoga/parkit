import { api } from './api.js';

const maxBytes = 50 * 1024 * 1024;
const mime = { pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown' };

export function initUploads(onUploaded) {
  const dialog = document.querySelector('#upload-dialog');
  const form = document.querySelector('#upload-form');
  const fileField = document.querySelector('#upload-file');
  const fileLabel = document.querySelector('#file-label');
  const submit = document.querySelector('#upload-submit');
  const close = document.querySelector('#close-upload');
  const message = document.querySelector('#upload-message');
  let uploading = false;

  function showMessage(text, error = false) {
    message.textContent = text;
    message.hidden = !text;
    message.toggleAttribute('data-error', error);
  }

  function checkFile() {
    const file = fileField.files[0];
    fileLabel.textContent = file?.name || 'Выбрать файл';
    const extension = file?.name.split('.').pop()?.toLowerCase();
    let error = '';
    if (file && !mime[extension]) error = 'Выберите PDF, TXT или Markdown.';
    else if (file && !file.size) error = 'Файл пуст. Выберите другой.';
    else if (file && file.size > maxBytes) error = 'Размер файла превышает 50 МБ.';
    showMessage(error, Boolean(error));
    submit.disabled = !file || Boolean(error);
    return error ? null : file;
  }

  document.querySelector('#open-upload').addEventListener('click', () => {
    form.reset();
    checkFile();
    dialog.showModal();
  });
  fileField.addEventListener('change', checkFile);
  dialog.addEventListener('cancel', event => { if (uploading) event.preventDefault(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (uploading) return;
    const file = checkFile();
    if (!file) return;
    uploading = true;
    fileField.disabled = true;
    close.disabled = true;
    submit.disabled = true;
    submit.textContent = 'Загружаем…';
    showMessage('Передаём файл в хранилище.');
    try {
      const extension = file.name.split('.').pop().toLowerCase();
      const normalized = file.type === mime[extension] ? file : new File([file], file.name, { type: mime[extension] });
      const document = await api.upload(normalized);
      onUploaded(document);
      dialog.close();
      location.hash = 'volumes';
    } catch (error) {
      showMessage(error.message || 'Не удалось загрузить файл.', true);
    } finally {
      uploading = false;
      fileField.disabled = false;
      close.disabled = false;
      submit.textContent = 'Загрузить';
      checkFile();
    }
  });
}
