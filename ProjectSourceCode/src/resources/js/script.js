// *****************************************************
// <!-- Reviews -->
// *****************************************************
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

// *****************************************************
// <!-- Listings -->
// *****************************************************
(() => {
  const modalEl = document.getElementById('listingDeleteModal');
  const confirmBtn = document.getElementById('confirmListingDeleteBtn');
  const flashEl = document.getElementById('listing-flash');
  const nameEl = modalEl?.querySelector('[data-listing-name]');
  const gridEl = document.getElementById('listings-grid');
  const emptyStateEl = document.getElementById('no-listings-message');

  if (!modalEl || !confirmBtn || typeof bootstrap === 'undefined') return;

  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  let pending = null;

  const updateEmptyState = () => {
    if (!gridEl || !emptyStateEl) return;
    const remainingCards = gridEl.querySelector('[data-listing-card]');
    if (remainingCards) {
      gridEl.classList.remove('d-none');
      emptyStateEl.classList.add('d-none');
    } else {
      gridEl.classList.add('d-none');
      emptyStateEl.classList.remove('d-none');
    }
  };

  modalEl.addEventListener('show.bs.modal', (event) => {
    const trigger = event.relatedTarget;
    if (!trigger) return;

    const listingId = trigger.getAttribute('data-listing-id');
    const deleteUrl = trigger.getAttribute('data-delete-url') || `/listings/${listingId}/delete`;
    pending = {
      listingId,
      deleteUrl,
      cardId: trigger.getAttribute('data-card-id')
    };

    if (nameEl) {
      nameEl.textContent = trigger.getAttribute('data-listing-title') || 'this listing';
    }
  });

  confirmBtn.addEventListener('click', async () => {
    if (!pending?.deleteUrl) return;

    confirmBtn.disabled = true;
    if (flashEl) flashEl.innerHTML = '';

    try {
      const res = await fetch(pending.deleteUrl, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to delete listing.');
      }

      if (pending.cardId) {
        document.getElementById(pending.cardId)?.remove();
        updateEmptyState();
      }

      if (flashEl) {
        flashEl.innerHTML = `<div class="alert alert-success mb-0" role="alert">${data.message || 'Listing deleted.'}</div>`;
        setTimeout(() => (flashEl.innerHTML = ''), 3000);
      }

      bsModal.hide();
    } catch (err) {
      if (flashEl) {
        flashEl.innerHTML = `<div class="alert alert-danger mb-0" role="alert">${err.message || 'Delete failed.'}</div>`;
        setTimeout(() => (flashEl.innerHTML = ''), 3000);
      }
    } finally {
      confirmBtn.disabled = false;
      pending = null;
    }
  });
})();
