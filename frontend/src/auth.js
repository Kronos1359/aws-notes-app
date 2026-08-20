const COGNITO_DOMAIN =
  'https://us-east-1hizdoiz3f.auth.us-east-1.amazoncognito.com'

const CLIENT_ID = '1sipdb5kv8spd6dqbvkmgf5nbi'

const REDIRECT_URI = 'http://localhost:5173/'

export function login() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'email openid phone',
    redirect_uri: REDIRECT_URI
  })

  window.location.href =
    `${COGNITO_DOMAIN}/login?${params.toString()}`
}

export async function handleCallback() {
  const params = new URLSearchParams(window.location.search)

  const code = params.get('code')

  if (!code) {
    return null
  }

  const response = await fetch(
    `${COGNITO_DOMAIN}/oauth2/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code,
        redirect_uri: REDIRECT_URI
      })
    }
  )

  if (!response.ok) {
    const message = await response.text()

    console.error('Cognito token error:', message)

    throw new Error('Failed to authenticate with Cognito')
  }

  const tokens = await response.json()

  localStorage.setItem(
    'cognito_tokens',
    JSON.stringify(tokens)
  )

  // Remove ?code=... from the browser URL
  window.history.replaceState(
    {},
    document.title,
    window.location.pathname
  )

  return tokens
}

export function getTokens() {
  const stored = localStorage.getItem('cognito_tokens')

  if (!stored) {
    return null
  }

  return JSON.parse(stored)
}

export function logout() {
  localStorage.removeItem('cognito_tokens')

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    logout_uri: REDIRECT_URI
  })

  window.location.href =
    `${COGNITO_DOMAIN}/logout?${params.toString()}`
}