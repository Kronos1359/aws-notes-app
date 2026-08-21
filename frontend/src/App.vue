<script setup>
import { ref, onMounted } from 'vue'
import Login from './Login.vue'

import {
  handleCallback,
  getTokens,
  getAccessToken,
  logout
} from './auth'

const isLoggedIn = ref(false)
const authLoading = ref(true)

const API_URL =
  'https://m4ccmcmzmss5glgty5qtr74gty0bkjaa.lambda-url.us-east-1.on.aws'

const notes = ref([])

const showForm = ref(false)
const title = ref('')
const content = ref('')
const selectedImages = ref([])

const loading = ref(false)
const error = ref('')

const selectedNote = ref(null)

const showEditModal = ref(false)
const editingNote = ref(null)
const editTitle = ref('')
const editContent = ref('')
const editNewImages = ref([])
const editExistingImages = ref([])

const showDeleteModal = ref(false)
const noteToDelete = ref(null)

const editLoading = ref(false)
const deleteLoading = ref(false)


/*
=========================================================
AUTH
=========================================================
*/

async function initializeAuth() {
  try {
    const tokens = await handleCallback()

    if (tokens) {
      isLoggedIn.value = true
      return
    }

    const existingTokens = getTokens()

    if (existingTokens?.access_token) {
      isLoggedIn.value = true
    }

  } catch (err) {
    console.error('Authentication error:', err)

    localStorage.removeItem('cognito_tokens')

    isLoggedIn.value = false

  } finally {
    authLoading.value = false
  }
}


function handleLogout() {
  logout()
}


/*
=========================================================
API
=========================================================
*/

async function apiFetch(url, options = {}) {
  const token = getAccessToken()

  if (!token) {
    throw new Error('No authentication token available')
  }

  const headers = new Headers(options.headers || {})

  headers.set('Authorization', `Bearer ${token}`)

  return fetch(url, {
    ...options,
    headers
  })
}


/*
=========================================================
IMAGE HELPERS
=========================================================
*/

function getNoteImages(note) {
  if (Array.isArray(note?.images)) {
    return note.images
  }

  // Backwards compatibility with old single-image notes
  if (note?.imageUrl) {
    return [
      {
        key: note.imageKey || '',
        url: note.imageUrl
      }
    ]
  }

  return []
}


/*
=========================================================
CREATE IMAGE SELECTION
=========================================================
*/

function handleImages(event) {
  selectedImages.value = Array.from(event.target.files || [])
}


/*
=========================================================
GET NOTES
=========================================================
*/

async function getNotes() {
  try {
    error.value = ''

    const response = await apiFetch(`${API_URL}/notes`)

    if (!response.ok) {
      throw new Error(`Failed to fetch notes: ${response.status}`)
    }

    notes.value = await response.json()

  } catch (err) {
    console.error(err)
    error.value = 'Could not load notes.'
  }
}


/*
=========================================================
CREATE NOTE
=========================================================
*/

async function addNote() {
  if (!title.value.trim() || !content.value.trim()) {
    alert('Please enter a title and content.')
    return
  }

  loading.value = true
  error.value = ''

  try {
    // Create note
    const response = await apiFetch(`${API_URL}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: title.value,
        content: content.value
      })
    })

    if (!response.ok) {
      const message = await response.text()
      console.error('Create note error:', message)
      throw new Error('Failed to create note')
    }

    const newNote = await response.json()

    // Upload every selected image
    for (const image of selectedImages.value) {
      const formData = new FormData()

      formData.append('image', image)

      const imageResponse = await apiFetch(
        `${API_URL}/notes/${newNote.id}/image`,
        {
          method: 'POST',
          body: formData
        }
      )

      if (!imageResponse.ok) {
        const message = await imageResponse.text()
        console.error('Image upload error:', message)

        alert(
          `Note was created, but ${image.name} could not be uploaded.`
        )
      }
    }

    // Reset form
    title.value = ''
    content.value = ''
    selectedImages.value = []

    const fileInput = document.querySelector('#image-input')

    if (fileInput) {
      fileInput.value = ''
    }

    showForm.value = false

    await getNotes()

  } catch (err) {
    console.error('Add note error:', err)
    error.value = 'Could not create note.'

  } finally {
    loading.value = false
  }
}


/*
=========================================================
EDIT MODAL
=========================================================
*/

function openEditModal(note) {
  editingNote.value = note

  editTitle.value = note.title
  editContent.value = note.content

  editExistingImages.value = [...getNoteImages(note)]

  editNewImages.value = []

  showEditModal.value = true

  // Close viewer if editing from viewer
  selectedNote.value = null
}

function closeEditModal(force = false) {
  if (editLoading.value && !force) {
    return
  }

  showEditModal.value = false

  editingNote.value = null
  editTitle.value = ''
  editContent.value = ''
  editExistingImages.value = []
  editNewImages.value = []
}


/*
=========================================================
EDIT IMAGE SELECTION
=========================================================
*/

function handleEditImages(event) {
  editNewImages.value = Array.from(event.target.files || [])
}


/*
=========================================================
REMOVE EXISTING IMAGE FROM EDIT MODAL

This only removes it from the list for now.
The actual S3/DynamoDB deletion happens when Save is clicked.
=========================================================
*/

function removeExistingImage(index) {
  editExistingImages.value.splice(index, 1)
}


/*
=========================================================
REMOVE NEWLY SELECTED IMAGE
=========================================================
*/

function removeNewImage(index) {
  editNewImages.value.splice(index, 1)
}


/*
=========================================================
SAVE EDIT
=========================================================
*/

async function saveEdit() {
  if (!editingNote.value) {
    return
  }

  if (!editTitle.value.trim() || !editContent.value.trim()) {
    alert('Please enter a title and content.')
    return
  }

  editLoading.value = true

  try {
    const noteId = editingNote.value.id

    /*
    -------------------------------------------------------
    1. Update title/content
    -------------------------------------------------------
    */

    const response = await apiFetch(
      `${API_URL}/notes/${noteId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: editTitle.value,
          content: editContent.value
        })
      }
    )

    if (!response.ok) {
      throw new Error('Failed to update note')
    }


    /*
    -------------------------------------------------------
    2. Determine which existing images were removed
    -------------------------------------------------------
    */

    const originalImages =
      getNoteImages(editingNote.value)

    const remainingKeys =
      new Set(
        editExistingImages.value.map(image => image.key)
      )

    const removedImages =
      originalImages.filter(
        image =>
          image.key &&
          !remainingKeys.has(image.key)
      )


    /*
    -------------------------------------------------------
    3. Delete removed images
    -------------------------------------------------------
    */

    for (const image of removedImages) {
      const deleteResponse = await apiFetch(
        `${API_URL}/notes/${noteId}/image`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            imageKey: image.key
          })
        }
      )

      if (!deleteResponse.ok) {
        console.error(
          'Failed to delete image:',
          image.key
        )
      }
    }


    /*
    -------------------------------------------------------
    4. Upload newly selected images
    -------------------------------------------------------
    */

    for (const image of editNewImages.value) {
      const formData = new FormData()

      formData.append('image', image)

      const uploadResponse = await apiFetch(
        `${API_URL}/notes/${noteId}/image`,
        {
          method: 'POST',
          body: formData
        }
      )

      if (!uploadResponse.ok) {
        console.error(
          'Failed to upload image:',
          image.name
        )

        alert(
          `Note updated, but ${image.name} could not be uploaded.`
        )
      }
    }


    /*
    -------------------------------------------------------
    5. Close modal and refresh
    -------------------------------------------------------
    */

    closeEditModal(true)

    await getNotes()

  } catch (err) {
    console.error('Edit error:', err)
    alert('Failed to update note.')

  } finally {
    editLoading.value = false
  }
}


/*
=========================================================
DELETE MODAL
=========================================================
*/

function openDeleteModal(note) {
  noteToDelete.value = note

  // Close viewer if delete was clicked there
  selectedNote.value = null

  showDeleteModal.value = true
}


function closeDeleteModal() {
  if (deleteLoading.value) {
    return
  }

  showDeleteModal.value = false
  noteToDelete.value = null
}


/*
=========================================================
DELETE NOTE
=========================================================
*/

async function confirmDelete() {
  if (!noteToDelete.value) {
    return
  }

  deleteLoading.value = true

  try {
    const id = noteToDelete.value.id

    const response = await apiFetch(
      `${API_URL}/notes/${id}`,
      {
        method: 'DELETE'
      }
    )

    if (!response.ok) {
      throw new Error('Failed to delete note')
    }

    closeDeleteModal()

    await getNotes()

  } catch (err) {
    console.error(err)
    alert('Failed to delete note.')

  } finally {
    deleteLoading.value = false
  }
}


/*
=========================================================
NOTE VIEWER
=========================================================
*/

function openNote(note) {
  selectedNote.value = note
}


function closeNote() {
  selectedNote.value = null
}


/*
=========================================================
ESCAPE KEY
=========================================================
*/

function handleKeydown(event) {
  if (event.key !== 'Escape') {
    return
  }

  if (showEditModal.value) {
    closeEditModal()
    return
  }

  if (showDeleteModal.value) {
    closeDeleteModal()
    return
  }

  if (selectedNote.value) {
    closeNote()
  }
}


/*
=========================================================
INITIALIZATION
=========================================================
*/

onMounted(async () => {
  await initializeAuth()

  if (isLoggedIn.value) {
    await getNotes()
  }

  window.addEventListener(
    'keydown',
    handleKeydown
  )
})
</script>

<template>
  <div v-if="authLoading">
    <p>Loading...</p>
  </div>

  <Login
    v-else-if="!isLoggedIn"
  />

  <div
    v-else
    class="page"
  >
    <div class="app">

      <!-- HEADER -->
      <header class="header">

        <div class="header-brand">
          <h1>My Notes</h1>
          <p class="subtitle">
            AWS Notes App
          </p>
        </div>

        <div class="header-actions">

          <button
            class="add-button"
            @click="showForm = true"
          >
            Add Note
          </button>

          <button
            class="logout-button"
            @click="handleLogout"
          >
            Logout
          </button>

        </div>

      </header>


      <!-- ERROR -->
      <div
        v-if="error"
        class="error"
        role="alert"
      >
        {{ error }}
      </div>


      <!-- CREATE NOTE -->
      <div
        v-if="showForm"
        class="form-card"
      >

        <h2 class="form-title">
          Create Note
        </h2>


        <div class="form-field">

          <label for="note-title">
            Title
          </label>

          <input
            id="note-title"
            v-model="title"
            type="text"
            placeholder="Give your note a title"
          />

        </div>


        <div class="form-field">

          <label for="note-content">
            Content
          </label>

          <textarea
            id="note-content"
            v-model="content"
            placeholder="Write your note..."
          ></textarea>

        </div>


        <div class="form-field">

          <label for="image-input">
            Images (optional)
          </label>

          <input
            id="image-input"
            type="file"
            accept="image/*"
            multiple
            class="file-input"
            @change="handleImages"
          />

        </div>


        <!-- SELECTED IMAGES -->
        <div
          v-if="selectedImages.length"
          class="selected-images"
        >

          <div
            v-for="(image, index) in selectedImages"
            :key="`${image.name}-${index}`"
            class="selected-image-item"
          >

            <span>
              {{ image.name }}
            </span>

            <button
              type="button"
              class="small-remove-button"
              @click="removeNewImage(index)"
            >
              Remove
            </button>

          </div>

        </div>


        <div class="form-buttons">

          <button
            class="save-button"
            @click="addNote"
            :disabled="loading"
          >
            {{ loading ? 'Saving...' : 'Save Note' }}
          </button>

          <button
            class="cancel-button"
            @click="showForm = false"
            :disabled="loading"
          >
            Cancel
          </button>

        </div>

      </div>


      <!-- NOTES -->
      <main class="main">

        <div
          v-if="notes.length === 0"
          class="empty"
        >

          <p class="empty-title">
            No notes yet
          </p>

          <p class="empty-hint">
            Use Add Note to create your first note.
          </p>

        </div>


        <div
          v-else
          class="notes"
        >

          <article
            v-for="note in notes"
            :key="note.id"
            class="note"
            @click="openNote(note)"
          >

            <h2 class="note-title">
              {{ note.title }}
            </h2>

            <p class="note-content">
              {{ note.content }}
            </p>


            <!-- IMAGE PREVIEW -->
            <div
              v-if="getNoteImages(note).length"
              class="note-images"
            >

              <img
                v-for="(image, index) in getNoteImages(note)"
                :key="image.key || index"
                :src="image.url"
                alt="Note image"
                class="note-image"
              />

            </div>


            <!-- ACTIONS -->
            <div
              class="actions"
              @click.stop
            >

              <button
                class="edit-button"
                @click="openEditModal(note)"
              >
                Edit
              </button>

              <button
                class="delete-button"
                @click="openDeleteModal(note)"
              >
                Delete
              </button>

            </div>

          </article>

        </div>

      </main>

    </div>


    <!-- ================================================= -->
    <!-- NOTE VIEWER -->
    <!-- ================================================= -->

    <div
      v-if="selectedNote"
      class="modal-overlay"
      @click.self="closeNote"
    >

      <div class="modal">

        <div class="modal-header">

          <h2 class="modal-title">
            {{ selectedNote.title }}
          </h2>

          <button
            class="close-button"
            @click="closeNote"
            aria-label="Close"
          >
            ×
          </button>

        </div>


        <div class="modal-body">

          <p class="modal-content">
            {{ selectedNote.content }}
          </p>


          <!-- ALL IMAGES -->
          <div
            v-if="getNoteImages(selectedNote).length"
            class="viewer-images"
          >

            <div
              v-for="(image, index) in getNoteImages(selectedNote)"
              :key="image.key || index"
              class="modal-image-wrap"
            >

              <img
                :src="image.url"
                alt="Note image"
                class="modal-image"
              />

            </div>

          </div>

        </div>


        <div class="modal-actions">

          <button
            class="modal-edit-button"
            @click="openEditModal(selectedNote)"
          >
            Edit
          </button>

          <button
            class="modal-delete-button"
            @click="openDeleteModal(selectedNote)"
          >
            Delete
          </button>

          <button
            class="modal-close-button"
            @click="closeNote"
          >
            Close
          </button>

        </div>

      </div>

    </div>


    <!-- ================================================= -->
    <!-- EDIT MODAL -->
    <!-- ================================================= -->

    <div
      v-if="showEditModal"
      class="modal-overlay"
      @click.self="closeEditModal"
    >

      <div class="modal edit-modal">

        <div class="modal-header">

          <h2 class="modal-title">
            Edit Note
          </h2>

          <button
            class="close-button"
            @click="closeEditModal"
            :disabled="editLoading"
          >
            ×
          </button>

        </div>


        <div class="modal-body">

          <!-- TITLE -->
          <div class="form-field">

            <label>
              Title
            </label>

            <input
              v-model="editTitle"
              type="text"
              placeholder="Note title"
            />

          </div>


          <!-- CONTENT -->
          <div class="form-field">

            <label>
              Content
            </label>

            <textarea
              v-model="editContent"
              placeholder="Note content"
            ></textarea>

          </div>


          <!-- EXISTING IMAGES -->
          <div
            v-if="editExistingImages.length"
            class="edit-section"
          >

            <label>
              Existing Images
            </label>

            <div class="edit-images">

              <div
                v-for="(image, index) in editExistingImages"
                :key="image.key || index"
                class="edit-image-card"
              >

                <img
                  :src="image.url"
                  alt="Existing note image"
                />

                <button
                  type="button"
                  class="remove-image-button"
                  @click="removeExistingImage(index)"
                  :disabled="editLoading"
                >
                  Remove
                </button>

              </div>

            </div>

          </div>


          <!-- NEW IMAGES -->
          <div class="edit-section">

            <label for="edit-image-input">
              Add Images
            </label>

            <input
              id="edit-image-input"
              type="file"
              accept="image/*"
              multiple
              class="file-input"
              @change="handleEditImages"
            />

          </div>


          <div
            v-if="editNewImages.length"
            class="edit-new-images"
          >

            <div
              v-for="(image, index) in editNewImages"
              :key="`${image.name}-${index}`"
              class="new-image-item"
            >

              <span>
                {{ image.name }}
              </span>

              <button
                type="button"
                class="small-remove-button"
                @click="removeNewImage(index)"
                :disabled="editLoading"
              >
                Remove
              </button>

            </div>

          </div>

        </div>


        <div class="modal-actions">

          <button
            class="save-button"
            @click="saveEdit"
            :disabled="editLoading"
          >
            {{ editLoading ? 'Saving...' : 'Save Changes' }}
          </button>

          <button
            class="cancel-button"
            @click="closeEditModal"
            :disabled="editLoading"
          >
            Cancel
          </button>

        </div>

      </div>

    </div>


    <!-- ================================================= -->
    <!-- DELETE CONFIRMATION -->
    <!-- ================================================= -->

    <div
      v-if="showDeleteModal"
      class="modal-overlay"
      @click.self="closeDeleteModal"
    >

      <div class="modal delete-modal">

        <div class="modal-header">

          <h2 class="modal-title">
            Delete Note
          </h2>

          <button
            class="close-button"
            @click="closeDeleteModal"
            :disabled="deleteLoading"
          >
            ×
          </button>

        </div>


        <div class="modal-body delete-body">

          <p>
            Are you sure you want to delete
            <strong>
              "{{ noteToDelete?.title }}"
            </strong>
            ?
          </p>

          <p class="delete-warning">
            This will permanently delete the note
            and all of its images.
          </p>

        </div>


        <div class="modal-actions">

          <button
            class="modal-delete-button"
            @click="confirmDelete"
            :disabled="deleteLoading"
          >
            {{ deleteLoading ? 'Deleting...' : 'Delete Note' }}
          </button>

          <button
            class="cancel-button"
            @click="closeDeleteModal"
            :disabled="deleteLoading"
          >
            Cancel
          </button>

        </div>

      </div>

    </div>

  </div>
</template>


<style scoped>

/* =========================================
   DESIGN TOKENS
========================================= */

.page {
  --white: #ffffff;

  --gray-50: #fafafa;
  --gray-100: #f4f4f5;
  --gray-200: #e4e4e7;
  --gray-300: #d4d4d8;
  --gray-400: #a1a1aa;
  --gray-500: #71717a;
  --gray-600: #52525b;
  --gray-700: #3f3f46;
  --gray-900: #18181b;

  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --accent-focus: rgb(37 99 235 / 0.18);

  --danger: #b91c1c;
  --danger-muted: #fef2f2;
  --danger-border: #fecaca;

  --surface: var(--white);
  --page-bg: var(--gray-100);

  --border: var(--gray-200);
  --border-strong: var(--gray-300);

  --text-primary: var(--gray-900);
  --text-secondary: var(--gray-600);
  --text-muted: var(--gray-500);

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;

  --shadow-subtle:
    0 1px 2px rgb(24 24 27 / 0.04);

  --shadow-card:
    0 1px 3px rgb(24 24 27 / 0.06);

  --shadow-modal:
    0 20px 60px rgb(0 0 0 / 0.2);

  min-height: 100vh;

  background: var(--page-bg);

  color: var(--text-primary);

  font-family:
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    Oxygen,
    Ubuntu,
    sans-serif;

  font-size: 15px;

  line-height: 1.6;
}


* {
  box-sizing: border-box;
}


/* =========================================
   APP
========================================= */

.app {
  max-width: 1080px;

  margin: 0 auto;

  padding: 40px 24px 56px;
}


/* =========================================
   HEADER
========================================= */

.header {
  display: flex;

  justify-content: space-between;

  align-items: flex-end;

  gap: 24px;

  flex-wrap: wrap;

  padding-bottom: 24px;

  margin-bottom: 32px;

  border-bottom: 1px solid var(--border);
}


.header-brand {
  min-width: 0;
}


h1 {
  margin: 0;

  font-size: 1.75rem;

  font-weight: 600;

  letter-spacing: -0.025em;

  color: var(--text-primary);

  line-height: 1.2;
}


.subtitle {
  margin: 6px 0 0;

  font-size: 0.9375rem;

  color: var(--text-secondary);
}


/* =========================================
   BUTTONS
========================================= */

button {
  border: 1px solid transparent;

  border-radius: var(--radius-sm);

  padding: 9px 16px;

  cursor: pointer;

  font-size: 0.875rem;

  font-weight: 500;

  font-family: inherit;

  line-height: 1.4;

  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    transform 0.15s ease;
}


button:disabled {
  opacity: 0.5;

  cursor: not-allowed;
}


/* =========================================
   ADD BUTTON
========================================= */

.add-button {
  flex-shrink: 0;

  background: var(--accent);

  color: var(--white);

  border-color: var(--accent);

  padding: 10px 18px;

  font-weight: 600;
}


.add-button:hover:not(:disabled) {
  background: var(--accent-hover);

  border-color: var(--accent-hover);
}


/* =========================================
   ERROR
========================================= */

.error {
  padding: 12px 16px;

  margin-bottom: 24px;

  background: var(--danger-muted);

  border: 1px solid var(--danger-border);

  border-radius: var(--radius-md);

  color: var(--danger);

  font-size: 0.875rem;
}


/* =========================================
   FORM
========================================= */

.form-card {
  background: var(--surface);

  padding: 28px;

  margin-bottom: 32px;

  border: 1px solid var(--border);

  border-radius: var(--radius-md);

  box-shadow: var(--shadow-subtle);
}


.form-title {
  margin: 0 0 24px;

  padding-bottom: 16px;

  border-bottom: 1px solid var(--border);

  font-size: 1.0625rem;

  font-weight: 600;

  color: var(--text-primary);
}


.form-field {
  margin-bottom: 20px;
}


.form-field label {
  display: block;

  margin-bottom: 8px;

  font-size: 0.8125rem;

  font-weight: 500;

  color: var(--text-secondary);
}


input[type='text'],
textarea,
.file-input {
  width: 100%;

  padding: 10px 12px;

  border: 1px solid var(--border-strong);

  border-radius: var(--radius-sm);

  font-size: 0.9375rem;

  font-family: inherit;

  color: var(--text-primary);

  background: var(--surface);

  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}


input[type='text']::placeholder,
textarea::placeholder {
  color: var(--gray-400);
}


input[type='text']:focus,
textarea:focus,
.file-input:focus {
  outline: none;

  border-color: var(--accent);

  box-shadow:
    0 0 0 3px var(--accent-focus);
}


textarea {
  min-height: 140px;

  resize: vertical;

  line-height: 1.6;
}


.file-input {
  padding: 8px 10px;

  cursor: pointer;

  background: var(--gray-50);
}


.file-input::file-selector-button {
  margin-right: 12px;

  padding: 7px 12px;

  border: 1px solid var(--border);

  border-radius: var(--radius-sm);

  background: var(--surface);

  color: var(--text-secondary);

  font-family: inherit;

  font-size: 0.8125rem;

  font-weight: 500;

  cursor: pointer;
}


.file-input::file-selector-button:hover {
  background: var(--gray-50);

  border-color: var(--border-strong);
}


.selected-image {
  margin: -8px 0 0;

  padding: 10px 12px;

  font-size: 0.8125rem;

  color: var(--text-secondary);

  background: var(--gray-50);

  border: 1px solid var(--border);

  border-radius: var(--radius-sm);
}


.form-buttons {
  display: flex;

  flex-wrap: wrap;

  gap: 10px;

  margin-top: 24px;

  padding-top: 20px;

  border-top: 1px solid var(--border);
}


.save-button {
  background: var(--accent);

  color: var(--white);

  border-color: var(--accent);
}


.save-button:hover:not(:disabled) {
  background: var(--accent-hover);

  border-color: var(--accent-hover);
}


.cancel-button {
  background: var(--surface);

  color: var(--text-secondary);

  border-color: var(--border-strong);
}


.cancel-button:hover:not(:disabled) {
  background: var(--gray-50);

  color: var(--text-primary);
}


/* =========================================
   NOTES GRID
========================================= */

.notes {
  display: grid;

  gap: 16px;

  grid-template-columns: 1fr;
}


@media (min-width: 768px) {
  .notes {
    grid-template-columns: repeat(2, 1fr);

    gap: 20px;
  }
}


@media (min-width: 1024px) {
  .notes {
    grid-template-columns: repeat(3, 1fr);
  }
}


/* =========================================
   NOTE CARD
========================================= */

.note {
  display: flex;

  flex-direction: column;

  height: 100%;

  min-width: 0;

  padding: 20px;

  background: var(--surface);

  border: 1px solid var(--border);

  border-radius: var(--radius-md);

  box-shadow: var(--shadow-subtle);

  cursor: pointer;

  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;

  overflow: hidden;
}


.note:hover {
  border-color: var(--border-strong);

  box-shadow: var(--shadow-card);

  transform: translateY(-1px);
}


/* =========================================
   NOTE TITLE
========================================= */

.note-title {
  margin: 0 0 8px;

  font-size: 1rem;

  font-weight: 600;

  line-height: 1.4;

  letter-spacing: -0.01em;

  color: var(--text-primary);

  overflow: hidden;

  text-overflow: ellipsis;

  white-space: nowrap;
}


/* =========================================
   NOTE CONTENT PREVIEW
========================================= */

.note-content {
  flex: 1;

  margin: 0;

  font-size: 0.875rem;

  line-height: 1.65;

  color: var(--text-secondary);

  white-space: pre-wrap;

  overflow: hidden;

  display: -webkit-box;

  -webkit-box-orient: vertical;

  -webkit-line-clamp: 6;

  line-clamp: 6;
}


/* =========================================
   IMAGE PREVIEW
========================================= */

.note-image-wrap {
  width: 100%;

  height: 180px;

  margin-top: 16px;

  overflow: hidden;

  border: 1px solid var(--border);

  border-radius: var(--radius-sm);

  background: var(--gray-50);

  flex-shrink: 0;
}


.note-image {
  display: block;

  width: 100%;

  height: 100%;

  object-fit: cover;
}


/* =========================================
   CARD ACTIONS
========================================= */

.actions {
  display: flex;

  flex-wrap: wrap;

  gap: 8px;

  margin-top: auto;

  padding-top: 16px;

  border-top: 1px solid var(--border);
}


.edit-button {
  padding: 7px 12px;

  background: var(--surface);

  color: var(--text-secondary);

  border-color: var(--border-strong);
}


.edit-button:hover:not(:disabled) {
  background: var(--gray-50);

  color: var(--text-primary);

  border-color: var(--gray-400);
}


.delete-button {
  padding: 7px 12px;

  background: var(--surface);

  color: var(--danger);

  border-color: var(--danger-border);
}


.delete-button:hover:not(:disabled) {
  background: var(--danger-muted);

  border-color: #fca5a5;
}


/* =========================================
   EMPTY STATE
========================================= */

.empty {
  padding: 64px 32px;

  text-align: center;

  background: var(--surface);

  border: 1px solid var(--border);

  border-radius: var(--radius-md);
}


.empty-title {
  margin: 0 0 8px;

  font-size: 1rem;

  font-weight: 600;

  color: var(--text-primary);
}


.empty-hint {
  margin: 0;

  font-size: 0.875rem;

  color: var(--text-muted);
}


/* =========================================
   NOTE VIEWER OVERLAY
========================================= */

.modal-overlay {
  position: fixed;

  inset: 0;

  z-index: 1000;

  display: flex;

  align-items: center;

  justify-content: center;

  padding: 24px;

  background: rgb(24 24 27 / 0.55);

  backdrop-filter: blur(3px);

  overflow-y: auto;
}


/* =========================================
   NOTE VIEWER
========================================= */

.modal {
  width: min(760px, 100%);

  max-height: calc(100vh - 48px);

  display: flex;

  flex-direction: column;

  background: var(--surface);

  border: 1px solid var(--border);

  border-radius: var(--radius-lg);

  box-shadow: var(--shadow-modal);

  overflow: hidden;
}


/* =========================================
   MODAL HEADER
========================================= */

.modal-header {
  display: flex;

  align-items: flex-start;

  justify-content: space-between;

  gap: 20px;

  padding: 20px 24px;

  border-bottom: 1px solid var(--border);

  flex-shrink: 0;
}


.modal-title {
  margin: 0;

  font-size: 1.25rem;

  font-weight: 600;

  line-height: 1.4;

  color: var(--text-primary);

  overflow-wrap: anywhere;
}


.close-button {
  flex-shrink: 0;

  width: 34px;

  height: 34px;

  padding: 0;

  display: flex;

  align-items: center;

  justify-content: center;

  border: 1px solid var(--border);

  border-radius: 50%;

  background: var(--surface);

  color: var(--gray-600);

  font-size: 1.4rem;

  font-weight: 400;

  line-height: 1;
}


.close-button:hover {
  background: var(--gray-100);

  color: var(--gray-900);
}


/* =========================================
   MODAL BODY
========================================= */

.modal-body {
  padding: 24px;

  overflow-y: auto;
}


.modal-content {
  margin: 0;

  font-size: 0.95rem;

  line-height: 1.75;

  color: var(--text-secondary);

  white-space: pre-wrap;

  overflow-wrap: anywhere;
}


/* =========================================
   FULL IMAGE
========================================= */

.modal-image-wrap {
  margin-top: 24px;

  display: flex;

  justify-content: center;

  background: var(--gray-50);

  border: 1px solid var(--border);

  border-radius: var(--radius-md);

  overflow: hidden;
}


.modal-image {
  display: block;

  max-width: 100%;

  max-height: 60vh;

  width: auto;

  height: auto;

  object-fit: contain;
}


/* =========================================
   MODAL ACTIONS
========================================= */

.modal-actions {
  display: flex;

  align-items: center;

  gap: 8px;

  padding: 16px 24px;

  border-top: 1px solid var(--border);

  flex-shrink: 0;
}


.modal-edit-button {
  background: var(--surface);

  color: var(--text-secondary);

  border-color: var(--border-strong);
}


.modal-edit-button:hover {
  background: var(--gray-50);

  color: var(--text-primary);
}


.modal-delete-button {
  background: var(--surface);

  color: var(--danger);

  border-color: var(--danger-border);
}


.modal-delete-button:hover {
  background: var(--danger-muted);

  border-color: #fca5a5;
}


.modal-close-button {
  margin-left: auto;

  background: var(--gray-900);

  color: var(--white);

  border-color: var(--gray-900);
}


.modal-close-button:hover {
  background: var(--gray-700);

  border-color: var(--gray-700);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logout-button {
  background: var(--surface);
  color: var(--text-secondary);
  border-color: var(--border-strong);
}

.logout-button:hover {
  background: var(--gray-50);
  color: var(--text-primary);
}


/* =========================================
   MOBILE
========================================= */

@media (max-width: 640px) {

  .app {
    padding: 24px 16px 40px;
  }


  .header {
    flex-direction: column;

    align-items: stretch;

    gap: 20px;
  }


  h1 {
    font-size: 1.5rem;
  }


  .add-button {
    width: 100%;

    text-align: center;
  }


  .form-card {
    padding: 20px 16px;
  }


  .form-buttons {
    flex-direction: column;
  }


  .form-buttons button {
    width: 100%;
  }


  .empty {
    padding: 48px 20px;
  }


  /* Modal on small screens */

  .modal-overlay {
    align-items: flex-start;

    padding: 12px;
  }


  .modal {
    max-height: calc(100vh - 24px);

    border-radius: var(--radius-md);
  }


  .modal-header {
    padding: 16px 18px;
  }


  .modal-body {
    padding: 18px;
  }


  .modal-actions {
    padding: 14px 18px;
  }


  .modal-image {
    max-height: 50vh;
  }

}

/* =========================================
   MULTIPLE IMAGES
========================================= */

.note-images {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 16px;
}

.note-images .note-image {
  width: 100%;
  height: 120px;
  object-fit: cover;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}


/* =========================================
   SELECTED IMAGES
========================================= */

.selected-images {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: -8px;
  margin-bottom: 20px;
}

.selected-image-item,
.new-image-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: var(--gray-50);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.small-remove-button {
  flex-shrink: 0;
  padding: 5px 9px;
  background: var(--surface);
  color: var(--danger);
  border: 1px solid var(--danger-border);
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  cursor: pointer;
}

.small-remove-button:hover:not(:disabled) {
  background: var(--danger-muted);
}


/* =========================================
   EDIT MODAL
========================================= */

.edit-modal {
  width: min(700px, 100%);
}

.edit-section {
  margin-top: 24px;
}

.edit-section > label {
  display: block;
  margin-bottom: 10px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.edit-images {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.edit-image-card {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--gray-50);
}

.edit-image-card img {
  display: block;
  width: 100%;
  height: 150px;
  object-fit: cover;
}

.remove-image-button {
  width: 100%;
  padding: 8px;
  background: var(--surface);
  color: var(--danger);
  border: 0;
  border-top: 1px solid var(--border);
  border-radius: 0;
  font-size: 0.8125rem;
  cursor: pointer;
}

.remove-image-button:hover:not(:disabled) {
  background: var(--danger-muted);
}

.edit-new-images {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}


/* =========================================
   VIEWER MULTIPLE IMAGES
========================================= */

.viewer-images {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.viewer-images .modal-image-wrap {
  margin-top: 0;
}


/* =========================================
   DELETE MODAL
========================================= */

.delete-modal {
  width: min(500px, 100%);
}

.delete-body p {
  margin: 0;
}

.delete-warning {
  margin-top: 12px !important;
  color: var(--danger);
  font-size: 0.875rem;
}


/* =========================================
   MOBILE
========================================= */

@media (max-width: 640px) {

  .note-images {
    grid-template-columns: 1fr;
  }

  .edit-images {
    grid-template-columns: 1fr;
  }

  .edit-image-card img {
    height: 180px;
  }

}

</style>