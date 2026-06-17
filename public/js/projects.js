import { createProject, deleteProject, getProjects, updateProject } from './api.js';
import { closeModal, escHtml, initModalDelegation, openConfirmModal, openModal, showToast, withLoading } from './utils.js';

initModalDelegation();

let projects = [];
const emptyMsgEl = document.getElementById('emptyMsg');

/**
 * projects 配列をもとにプロジェクト一覧をDOMに描画する。
 * プロジェクトがない場合は空状態メッセージを表示する。
 */
function renderList() {
  const ul = document.getElementById('projectList');

  if (projects.length === 0) {
    ul.innerHTML = '';
    emptyMsgEl.textContent = 'プロジェクトがありません。新規プロジェクトを作成してください。';
    ul.appendChild(emptyMsgEl);
    return;
  }

  ul.innerHTML = '';
  projects.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'project-item';
    li.innerHTML = `
      <span class="project-name truncate" title="${escHtml(p.name)}">${escHtml(p.name)}</span>
      <span class="project-desc truncate">${escHtml(p.description || '')}</span>
      <div class="project-actions">
        <a href="/workspace.html?projectId=${p._id}" class="btn btn-primary btn-sm">エディタを開く</a>
        <button class="btn btn-outline btn-sm" data-id="${p._id}" data-action="edit">編集</button>
        <button class="btn btn-danger btn-sm" data-id="${p._id}" data-action="delete">削除</button>
      </div>
    `;
    ul.appendChild(li);
  });
}

/**
 * APIからプロジェクト一覧を取得してUIに反映する。
 * @returns {Promise<void>}
 */
async function loadProjects() {
  const res = await getProjects();
  if (res.error) { showToast(res.error, 'error'); return; }
  projects = res.data || [];
  renderList();
}

// 「新規プロジェクト」ボタンがクリックされたら、作成フォームをクリアして作成モーダルを開く
document.getElementById('addProjectBtn').addEventListener('click', () => {
  document.getElementById('createName').value = '';
  document.getElementById('createDesc').value = '';
  openModal('createModal');
});

// 作成モーダルの「保存」ボタンがクリックされたら、入力値を検証してプロジェクトを作成し、一覧を再読み込みする
document.getElementById('createSave').addEventListener('click', async(e) => {
  const name = document.getElementById('createName').value.trim();
  if (!name) { showToast('プロジェクト名は必須です', 'error'); return; }
  const desc = document.getElementById('createDesc').value.trim();
  await withLoading(e.currentTarget, async() => {
    const res = await createProject({ name, description: desc });
    if (res.error) { showToast(res.error, 'error'); return; }
    closeModal('createModal');
    showToast('プロジェクトを作成しました');
    await loadProjects();
  });
});

// 一覧内の「編集」「削除」ボタンがクリックされたら、編集モーダルを開く、または確認後にプロジェクトを削除する
document.getElementById('projectList').addEventListener('click', (e) => {
  const action = e.target.dataset.action;
  const id = e.target.dataset.id;
  if (!action || !id) { return; }

  if (action === 'delete') {
    openConfirmModal('このプロジェクトを削除しますか？（カテゴリ・列も全て削除されます）', async() => {
      const res = await deleteProject(id);
      if (res.error) { showToast(res.error, 'error'); return; }
      showToast('プロジェクトを削除しました');
      await loadProjects();
    });
  }

  if (action === 'edit') {
    const p = projects.find((x) => x._id === id);
    if (!p) { return; }
    document.getElementById('editId').value = p._id;
    document.getElementById('editName').value = p.name;
    document.getElementById('editDesc').value = p.description || '';
    openModal('editModal');
  }
});

// 編集モーダルの「保存」ボタンがクリックされたら、入力値を検証してプロジェクトを更新し、一覧を再読み込みする
document.getElementById('editSave').addEventListener('click', async(e) => {
  const id = document.getElementById('editId').value;
  const name = document.getElementById('editName').value.trim();
  if (!name) { showToast('プロジェクト名は必須です', 'error'); return; }
  const description = document.getElementById('editDesc').value.trim();
  await withLoading(e.currentTarget, async() => {
    const res = await updateProject(id, { name, description });
    if (res.error) { showToast(res.error, 'error'); return; }
    closeModal('editModal');
    showToast('プロジェクトを更新しました');
    await loadProjects();
  });
});

loadProjects();
