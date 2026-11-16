let clicks = 0;

document.getElementById('test-btn')?.addEventListener('click', () => {
  clicks += 1;
  const status = document.getElementById('status-msg');
  if (status) {
    status.textContent = 'JavaScript ativo! Cliques registrados neste teste: ' + clicks;
  }
});

document.getElementById('theme-btn')?.addEventListener('click', () => {
  document.body.classList.toggle('dark');
});
