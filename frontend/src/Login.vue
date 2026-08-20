<script setup>
import { login } from './auth'
</script>

<template>
  <div class="login-page">
    <div class="login-card">

      <div class="login-header">
        <h1>Welcome back</h1>
        <p>Sign in to your AWS Notes account</p>
      </div>

      <button
        type="button"
        class="login-button"
        @click="login"
      >
        Sign In
      </button>

      <p class="signup-text">
        Don't have an account?
        <button
          type="button"
          class="signup-button"
          @click="login"
        >
          Create account
        </button>
      </p>

    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;

  background: #f4f4f5;

  font-family:
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    Oxygen,
    Ubuntu,
    sans-serif;
}

.login-card {
  width: 100%;
  max-width: 420px;

  padding: 36px;

  background: #ffffff;

  border: 1px solid #e4e4e7;
  border-radius: 12px;

  box-shadow:
    0 10px 30px rgb(24 24 27 / 0.08);
}

.login-header {
  margin-bottom: 28px;
  text-align: center;
}

.login-header h1 {
  margin: 0;

  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.025em;

  color: #18181b;
}

.login-header p {
  margin: 8px 0 0;

  font-size: 0.9375rem;

  color: #71717a;
}

.form-field {
  margin-bottom: 20px;
}

.form-field label {
  display: block;

  margin-bottom: 8px;

  font-size: 0.875rem;
  font-weight: 500;

  color: #3f3f46;
}

.form-field input {
  width: 100%;

  padding: 11px 12px;

  border: 1px solid #d4d4d8;
  border-radius: 6px;

  font-size: 0.9375rem;
  font-family: inherit;

  color: #18181b;
  background: #ffffff;

  outline: none;

  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.form-field input:focus {
  border-color: #2563eb;

  box-shadow:
    0 0 0 3px rgb(37 99 235 / 0.15);
}

.form-field input::placeholder {
  color: #a1a1aa;
}

.login-button {
  width: 100%;

  padding: 11px 16px;

  border: 1px solid #2563eb;
  border-radius: 6px;

  background: #2563eb;
  color: #ffffff;

  font-size: 0.9375rem;
  font-weight: 600;
  font-family: inherit;

  cursor: pointer;

  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.login-button:hover {
  background: #1d4ed8;
  border-color: #1d4ed8;
}

.error {
  margin: -4px 0 16px;

  font-size: 0.875rem;

  color: #b91c1c;
}

.signup-text {
  margin: 24px 0 0;

  text-align: center;

  font-size: 0.875rem;

  color: #71717a;
}

.signup-button {
  padding: 0;

  border: none;

  background: transparent;
  color: #2563eb;

  font-size: inherit;
  font-family: inherit;
  font-weight: 500;

  cursor: pointer;
}

.signup-button:hover {
  text-decoration: underline;
}

@media (max-width: 480px) {
  .login-page {
    padding: 16px;
  }

  .login-card {
    padding: 28px 22px;
  }
}
</style>