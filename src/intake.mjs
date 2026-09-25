/** 所有视频入口共用：每次验证、不重复点击、所有退出路径恢复按钮。 */
export async function prepareIntake(client, button, loadCatalog) {
  if (button.disabled) return false;
  const label = button.textContent === '加载失败，点击重试' ? '添加到金榜' : button.textContent;
  button.disabled = true; button.setAttribute('aria-busy', 'true');
  button.textContent = '正在验证授权…'; button.title = '';
  try {
    await client.request('verify');
    button.textContent = '正在加载…';
    await loadCatalog();
    return true;
  } catch (error) {
    if (error.code === 'authorization_required') {
      button.title = '请在金榜页面点击“一键授权”，完成后回来再次添加。';
      try { await client.open(); } catch { button.title = '无法打开授权页，请访问 https://cngist.com/admin/submission_token 完成一键授权。'; }
    } else {
      button.title = error.message;
      button.textContent = '加载失败，点击重试';
    }
    return false;
  } finally {
    if (button.textContent !== '加载失败，点击重试') button.textContent = label;
    button.disabled = false; button.removeAttribute('aria-busy');
  }
}
