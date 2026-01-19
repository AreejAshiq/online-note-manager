document.addEventListener('DOMContentLoaded', () => {
    // --- Initial Setup ---
    const appData = document.getElementById('app-data');
    let notes = JSON.parse(appData.dataset.notes || '[]');

    let isAuthenticated = appData.dataset.isAuthenticated === 'true';
    let editModal = document.getElementById('edit-note-modal');

    
    let selectedNotes = new Set();
    let currentDetailNoteId = null;

   
    const noteCreationForm = document.getElementById('note-creation-form');
    const toggleNoteFormBtn = document.getElementById('toggle-note-form-btn');

    // --- Utility Functions (Local Storage & Note Handling) ---
    function saveLocalNotes() {
        localStorage.setItem('notes', JSON.stringify(notes));
    }
    function loadLocalNotes() {
        return JSON.parse(localStorage.getItem('notes') || '[]');
    }

    // 💡 NEW FUNCTION: Form ko hide karne aur clear karne ke liye
    function hideCreationForm() {
        if (noteCreationForm) {
            noteCreationForm.classList.remove('visible-form');
            noteCreationForm.classList.add('hidden-form');
            toggleNoteFormBtn.textContent = '➕ Create New Note';
        }
        // Form inputs ko clear karna
        document.getElementById('note-title-input').value = '';
        document.getElementById('note-content-input').value = '';
        document.getElementById('note-category-input').value = 'Miscellaneous';
        document.getElementById('reminder-date-input').value = '';
        document.getElementById('pin-note-btn').dataset.pinned = 'false';
        document.getElementById('pin-note-btn').classList.remove('pinned');
        document.getElementById('pin-icon').textContent = '📍';
    }

    // --- SERVER API FUNCTIONS (Backend Connection) ---

    async function createServerNote(noteData) {
        try {
            const response = await fetch('/create_note', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(noteData)
            });
            const result = await response.json();
            if (result.status === 'success') {
                return result.note; // Server se returned note (with ID)
            } else {
                console.error('Error creating note:', result.message);
                return null;
            }
        } catch (error) {
            console.error('Network error:', error);
        }
    }

    async function updateServerNote(noteId, noteData) {
        try {
            const response = await fetch(`/update_note/${noteId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(noteData)
            });
            const result = await response.json();
            if (result.status !== 'success') {
                console.error('Error updating note:', result.message);
            }
        } catch (error) {
            console.error('Network error:', error);
        }
    }

    async function deleteServerNote(noteId) {
        try {
            await fetch(`/delete_note/${noteId}`, {
                method: 'DELETE'
            });
        } catch (error) {
            console.error('Network error:', error);
        }
    }

    // --- MAIN LOGIC ---

    async function saveNote(newNote) {
        // UI Update Logic (Optimistic UI Update)
        let isNew = !newNote.id;
        let successfullySaved = false;

        if (isAuthenticated) {
            if (isNew) {
                const savedNote = await createServerNote(newNote);
                if (savedNote) {
                    notes.unshift(savedNote);
                    successfullySaved = true;
                }
            } else {
                const index = notes.findIndex(n => n.id === newNote.id);
                if (index !== -1) {
                    notes[index] = { ...notes[index], ...newNote, updated_at: new Date().toISOString() };
                    updateServerNote(newNote.id, newNote);
                    successfullySaved = true; // Assume update will succeed
                }
            }
        } else {
            // GUEST MODE (Local Storage)
            if (isNew) {
                newNote.id = Date.now(); // Generate temp ID
                newNote.created_at = new Date().toISOString();
                newNote.updated_at = new Date().toISOString();
                notes.unshift(newNote);
                successfullySaved = true;
            } else {
                const index = notes.findIndex(n => n.id === newNote.id);
                if (index !== -1) {
                    notes[index] = { ...notes[index], ...newNote, updated_at: new Date().toISOString() };
                    successfullySaved = true;
                }
            }
            saveLocalNotes();
        }

        // 💡 NEW LOGIC: Note save hone ke baad form ko hide karo
        if (isNew && successfullySaved) {
            hideCreationForm();
        }

        // Re-sort notes
        sortAndDisplayNotes();

        // Note save hone ke baad agar naya tha to pehla wala select karo, warna wahi wala
        if (successfullySaved) {
            if (isNew && notes.length > 0) {
                showNoteDetail(notes[0].id);
            } else {
                showNoteDetail(newNote.id);
            }
        }
    }

    function deleteNote(id) {
        notes = notes.filter(n => n.id !== id);

        if (isAuthenticated) {
            deleteServerNote(id);
        } else {
            saveLocalNotes();
        }

        if (currentDetailNoteId === id) {
            clearNoteDetail();
        }
        displayNotes();
        updateBulkActionUI();
    }

    function downloadNote(noteId) {
        const note = notes.find(n => n.id === noteId);
        if (!note) return;
        const text = `Title: ${note.title}\nCategory: ${note.category}\nReminder: ${note.reminder_date || 'None'}\n\nContent:\n${note.content}`;
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${note.title.replace(/[^a-z0-9]/gi, '_') || 'Untitled_Note'}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    // --- SERVER API FUNCTIONS (Backend Connection) ---

    // 💡 NEW FUNCTION FOR SYNCING LOCAL DATA TO SERVER
    async function syncLocalNotesWithServer(localNotes) {
        if (localNotes.length === 0) {
            console.log("No local notes to sync.");
            return true; // Success, because nothing to sync
        }

        // Notes ko Local Storage se clear kar do takay dobara sync na hon.
        localStorage.removeItem('notes');

        try {
            const response = await fetch('/sync_notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(localNotes) // Local notes array ko bhej rahe hain
            });

            const result = await response.json();

            if (result.status === 'success') {
                notes = result.cloud_notes;
                console.log(`✅ Successfully synced ${result.synced_count} local notes.`);
                return true;
            } else {
                console.error('Error during sync:', result.message);
                localStorage.setItem('notes', JSON.stringify(localNotes));
                return false;
            }
        } catch (error) {
            console.error('Network error during sync:', error);
            
            localStorage.setItem('notes', JSON.stringify(localNotes));
            return false;
        }
    }

    // Guest mode mein local notes load karo
    if (!isAuthenticated) {
        notes = loadLocalNotes();
    }

    // --- Rendering Functions ---

    function sortAndDisplayNotes() {
        notes.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            // Use updated_at for sorting
            return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
        });
        displayNotes();
    }

    function displayNotes(notesToDisplay = notes) {
        const notesList = document.getElementById('notes-list');
        notesList.innerHTML = '';

        notesToDisplay.forEach(note => {
            const noteElement = document.createElement('div');
            const isSelected = selectedNotes.has(note.id);
            const isCurrentDetail = currentDetailNoteId === note.id;

            noteElement.className = `note-list-item ${isCurrentDetail ? 'selected' : ''}`;
            noteElement.dataset.noteId = note.id;

            const pinIcon = note.is_pinned ? `<span class="list-pin-icon">📌</span>` : '';
            const snippet = (note.content || 'No content').substring(0, 30);

            noteElement.innerHTML = `
                <button class="select-note-btn ${isSelected ? 'selected-tick' : ''}" data-note-id="${note.id}">
                    ${isSelected ? '✔' : ''}
                </button> 
                <div class="list-content">
                    <span class="list-title">${note.title || 'Untitled'}</span>
                    <span class="list-snippet">${snippet}</span>
                </div>
                ${pinIcon}
            `;
            notesList.appendChild(noteElement);
        });

        setupNoteSelectionListeners();
        updateBulkActionUI();
    }

    function showNoteDetail(noteId) {
        const note = notes.find(n => n.id === noteId);

        // UI Update
        document.querySelectorAll('.note-list-item').forEach(item => item.classList.remove('selected'));
        const currentItem = document.querySelector(`.note-list-item[data-note-id="${noteId}"]`);
        if (currentItem) currentItem.classList.add('selected');

        if (!note) {
            clearNoteDetail();
            return;
        }

        currentDetailNoteId = note.id;

        const categoryTag = `<span class="detail-category-tag">Category: <span>${note.category || 'Miscellaneous'}</span></span>`;
        let reminderFormatted = '';
        if (note.reminder_date) {
            try {
                const date = new Date(note.reminder_date);
                if (!isNaN(date)) {
                    reminderFormatted = `<span class="detail-reminder">⏰ Reminder: <span>${date.toLocaleString()}</span></span>`;
                }
            } catch (e) { }
        }

        document.getElementById('note-detail-view').innerHTML = `
            <h1 class="detail-title">${note.title || 'Untitled'}</h1>
            <div class="detail-meta">
                ${categoryTag}
                ${reminderFormatted}
            </div>
            <div class="detail-content">${note.content || ''}</div>
        `;
    }

    function clearNoteDetail() {
        document.getElementById('note-detail-view').innerHTML =
            '<p class="placeholder-text">Select a note from the sidebar to view its content.</p>';
        currentDetailNoteId = null;
        document.querySelectorAll('.note-list-item').forEach(item => item.classList.remove('selected'));
    }

    // --- EVENT LISTENERS ---

    function setupNoteSelectionListeners() {
        document.querySelectorAll('.note-list-item').forEach(item => {
            const noteId = Number(item.dataset.noteId);
            const selectBtn = item.querySelector('.select-note-btn');

            selectBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleNoteSelection(noteId);
            });

            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('select-note-btn') && !e.target.closest('.select-note-btn')) {
                    showNoteDetail(noteId);
                }
            });
        });
    }

    function toggleNoteSelection(noteId) {
        const item = document.querySelector(`.note-list-item[data-note-id="${noteId}"]`);
        const selectBtn = item.querySelector('.select-note-btn');

        if (selectedNotes.has(noteId)) {
            selectedNotes.delete(noteId);
            selectBtn.textContent = '';
            selectBtn.classList.remove('selected-tick');
        } else {
            selectedNotes.add(noteId);
            selectBtn.textContent = '✔';
            selectBtn.classList.add('selected-tick');
        }
        updateBulkActionUI();
    }

    function updateBulkActionUI() {
        const bulkActionContainer = document.getElementById('bulk-actions');
        const selectedCountSpan = document.getElementById('selected-count');
        const bulkEditBtn = document.getElementById('bulk-edit-btn');
        const count = selectedNotes.size;

        if (count > 0) {
            bulkActionContainer.classList.remove('hidden');
            selectedCountSpan.textContent = `${count} note${count > 1 ? 's' : ''} selected`;
            bulkEditBtn.disabled = count !== 1;
        } else {
            bulkActionContainer.classList.add('hidden');
        }
    }

    function editNote(noteId) {
        const note = notes.find(n => n.id === noteId);
        if (!note) return;

        selectedNotes.clear();
        updateBulkActionUI();

        document.getElementById('edit-note-id').value = note.id;
        document.getElementById('edit-title').value = note.title;
        document.getElementById('edit-content').value = note.content;
        document.getElementById('edit-category').value = note.category;

        let reminderDate = note.reminder_date ? new Date(note.reminder_date) : null;
        if (reminderDate && !isNaN(reminderDate)) {
            const offset = reminderDate.getTimezoneOffset() * 60000;
            const localDate = new Date(reminderDate.getTime() - offset).toISOString().slice(0, 16);
            document.getElementById('edit-reminder-date').value = localDate;
        } else {
            document.getElementById('edit-reminder-date').value = '';
        }

        const editPinBtn = document.getElementById('edit-pin-btn');
        editPinBtn.dataset.pinned = note.is_pinned;
        document.getElementById('edit-pin-icon').textContent = note.is_pinned ? '📌' : '📍';
        editPinBtn.classList.toggle('pinned', note.is_pinned);

        editModal.style.display = 'block';
    }

    function setupEventListeners() {

        // 💡 NEW: TOGGLE FORM VISIBILITY
        if (toggleNoteFormBtn) {
            toggleNoteFormBtn.addEventListener('click', () => {
                const isHidden = noteCreationForm.classList.contains('hidden-form');

                if (isHidden) {
                    noteCreationForm.classList.remove('hidden-form');
                    noteCreationForm.classList.add('visible-form');
                    toggleNoteFormBtn.textContent = '❌ Close Note Form';
                } else {
                    hideCreationForm();
                }
            });
        }

        // SAVE NEW NOTE
        document.getElementById('save-note-btn').addEventListener('click', () => {
            const title = document.getElementById('note-title-input').value.trim();
            const content = document.getElementById('note-content-input').value.trim();
            const category = document.getElementById('note-category-input').value;
            const reminder_date = document.getElementById('reminder-date-input').value;
            const is_pinned = document.getElementById('pin-note-btn').dataset.pinned === 'true';

            if (!title && !content) {
                alert('Title or content is required.');
                return;
            }

            const newNote = { id: null, title, content, category, reminder_date, is_pinned };
            saveNote(newNote); // saveNote ab form ko hide karega
        });

        // PIN TOGGLE
        document.getElementById('pin-note-btn').addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const isPinned = btn.dataset.pinned === 'true';
            btn.dataset.pinned = !isPinned;
            btn.classList.toggle('pinned', !isPinned);
            document.getElementById('pin-icon').textContent = !isPinned ? '📌' : '📍';
        });

        // SEARCH
        document.getElementById('search-input').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredNotes = notes.filter(note =>
                note.title.toLowerCase().includes(searchTerm) ||
                note.content.toLowerCase().includes(searchTerm)
            );
            displayNotes(filteredNotes);
        });

        // BULK DELETE
        document.getElementById('bulk-delete-btn').addEventListener('click', () => {
            if (selectedNotes.size === 0) return;
            if (confirm(`Delete ${selectedNotes.size} notes?`)) {
                Array.from(selectedNotes).forEach(noteId => deleteNote(Number(noteId)));
                selectedNotes.clear();
                updateBulkActionUI();
            }
        });

        // BULK EDIT
        document.getElementById('bulk-edit-btn').addEventListener('click', () => {
            if (selectedNotes.size === 1) {
                editNote(Array.from(selectedNotes)[0]);
            }
        });

        // BULK DOWNLOAD
        document.getElementById('bulk-download-btn').addEventListener('click', () => {
            if (selectedNotes.size === 0) return;
            Array.from(selectedNotes).forEach(noteId => downloadNote(Number(noteId)));
        });

        // SAVE EDIT
        document.getElementById('save-edit-btn').addEventListener('click', () => {
            const noteId = Number(document.getElementById('edit-note-id').value);
            const title = document.getElementById('edit-title').value.trim();
            const content = document.getElementById('edit-content').value.trim();
            const category = document.getElementById('edit-category').value;
            const reminder_date = document.getElementById('edit-reminder-date').value;
            const is_pinned = document.getElementById('edit-pin-btn').dataset.pinned === 'true';

            if (!title && !content) {
                alert('Title/Content required.');
                return;
            }

            const updatedNote = { id: noteId, title, content, category, reminder_date, is_pinned };
            saveNote(updatedNote);

            editModal.style.display = 'none';
        });

        // CLOSE MODAL
        document.querySelector('.close-btn').addEventListener('click', () => {
            editModal.style.display = 'none';
        });

        // PIN EDIT MODAL
        document.getElementById('edit-pin-btn').addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const isPinned = btn.dataset.pinned === 'true';
            btn.dataset.pinned = !isPinned;
            btn.classList.toggle('pinned', !isPinned);
            document.getElementById('edit-pin-icon').textContent = !isPinned ? '📌' : '📍';
        });
    }

    // Initialize
    setupEventListeners();
    sortAndDisplayNotes();
    clearNoteDetail();

    // 💡 NEW SYNC LOGIC HERE
    if (isAuthenticated) {
        const localNotes = loadLocalNotes(); // Local storage se notes load karo

        if (localNotes.length > 0) {
            
            syncLocalNotesWithServer(localNotes).then(success => {
                if (success) {
                    // Sync hone ke baad UI ko refresh karo
                    sortAndDisplayNotes();
                }
            });
        }
    }
    // 💡 NEW: Shuru mein form ko hide rakho
    hideCreationForm();

});