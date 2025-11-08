(() => {
  let reviewIdToDelete = null;

  const modalEl = document.getElementById('confirmDeleteModal');
  const confirmBtn = document.getElementById('confirmDeleteBtn');
  const gridEl = document.getElementById('reviews-grid');
  const emptyStateEl = document.getElementById('no-reviews-message');

  if (!modalEl || !confirmBtn) return;

  const bsModal = new bootstrap.Modal(modalEl);

  const updateEmptyState = () => {
    if (!gridEl) {
      emptyStateEl?.classList.remove('d-none');
      return;
    }

    const hasCards = gridEl.querySelector('[id^="review-card-col-"]');
    if (hasCards) {
      gridEl.classList.remove('d-none');
      emptyStateEl?.classList.add('d-none');
    } else {
      gridEl.classList.add('d-none');
      emptyStateEl?.classList.remove('d-none');
    }
  };

  // When opening the modal, capture the review id from the button that triggered it
  modalEl.addEventListener('show.bs.modal', (event) => {
    const triggerBtn = event.relatedTarget; // the "Delete review" button
    reviewIdToDelete = triggerBtn?.getAttribute('data-review-id') || null;
  });

  // On confirm, call API, remove card, hide modal
  confirmBtn.addEventListener('click', async () => {
    if (!reviewIdToDelete) return;

    try {
      const res = await fetch(`/delete-review/${reviewIdToDelete}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete review.');

      // Remove the card column from the grid
      document.getElementById(`review-card-col-${reviewIdToDelete}`)?.remove();
      updateEmptyState();

      // Optionally show a lightweight flash message
      const flash = document.getElementById('flash');
      if (flash) {
        flash.innerHTML = `<div class="alert alert-success mb-0" role="alert">${data.message || 'Review deleted.'}</div>`;
        setTimeout(() => (flash.innerHTML = ''), 2500);
      }

      bsModal.hide();
    } catch (err) {
      const flash = document.getElementById('flash');
      if (flash) {
        flash.innerHTML = `<div class="alert alert-danger mb-0" role="alert">${err.message || 'Delete failed.'}</div>`;
        setTimeout(() => (flash.innerHTML = ''), 3000);
      }
      bsModal.hide();
    } finally {
      reviewIdToDelete = null;
    }
  });
})();
