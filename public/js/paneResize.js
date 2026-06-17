/**
 * ペイン幅のドラッグリサイズに関する共通ユーティリティ。
 * workspace画面・snapshots画面など、複数ペイン構成の画面から利用される。
 */

/**
 * localStorageに保存された値をclampして返す。値が無い・不正な場合はデフォルト値を返す。
 * @param {string} storageKey - localStorageキー
 * @param {number} min - 最小幅(px)
 * @param {number} max - 最大幅(px)
 * @param {number} defaultWidth - デフォルト幅(px)
 * @returns {number}
 */
export function loadPaneWidth(storageKey, min, max, defaultWidth) {
  const stored = Number(localStorage.getItem(storageKey));
  if (!stored || isNaN(stored)) { return defaultWidth; }
  return Math.min(Math.max(stored, min), max);
}

/**
 * リサイズハンドルにドラッグ操作を割り当てる。
 * @param {HTMLElement} bodyEl - CSS変数を保持するペイン全体のコンテナ要素
 * @param {HTMLElement} handle - ドラッグ対象のハンドル要素
 * @param {string} cssVar - 更新するCSS変数名
 * @param {string} storageKey - 幅を保存するlocalStorageキー
 * @param {number} min - 最小幅(px)
 * @param {number} max - 最大幅(px)
 * @param {(startWidth: number, deltaX: number) => number} computeWidth - ドラッグ量から新しい幅を計算する関数
 */
export function initResizeHandle(bodyEl, handle, cssVar, storageKey, min, max, computeWidth) {
  // リサイズハンドルがマウスダウンされたら、ドラッグによるペイン幅変更を開始する
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = parseFloat(getComputedStyle(bodyEl).getPropertyValue(cssVar));

    handle.classList.add('dragging');
    document.body.classList.add('resizing');

    const onMouseMove = (moveEvent) => {
      const newWidth = Math.min(Math.max(computeWidth(startWidth, moveEvent.clientX - startX), min), max);
      bodyEl.style.setProperty(cssVar, `${newWidth}px`);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      handle.classList.remove('dragging');
      document.body.classList.remove('resizing');
      localStorage.setItem(storageKey, getComputedStyle(bodyEl).getPropertyValue(cssVar).replace('px', ''));
    };

    // ドラッグ中にマウスが移動したら、ペイン幅を再計算してCSS変数に反映する
    document.addEventListener('mousemove', onMouseMove);
    // マウスボタンが離されたら、ドラッグ用リスナーを解除し、確定した幅をlocalStorageに保存する
    document.addEventListener('mouseup', onMouseUp);
  });
}
