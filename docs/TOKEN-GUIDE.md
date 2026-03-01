# How to Get Your Are.na API Token

You need a free API token to fetch your Are.na data. It takes about 2 minutes.

## Steps

1. **Go to the Are.na developer page**
   https://dev.are.na/oauth/applications

2. **Log in** with your normal Are.na account (same email and password you already use)

3. **Click "New Application"**

4. **Fill in the form:**
   - **Name:** anything you want, like `arena-3d`
   - **Redirect URI:** `urn:ietf:wg:oauth:2.0:oob`
   - Everything else can stay blank

5. **Click "Submit"**

6. **Copy your token** — it will be listed as "Personal Access Token" on the application page. It looks like a long string of random letters and numbers.

## Using Your Token

### Option A: Paste it during setup

When you run `npm run setup`, you'll be asked for your token. Just paste it in.

### Option B: Add it to your config file

Open `config/arena-3d.config.js` and put your token in the `token` field:

```js
arena: {
  username: 'your-username',
  token: 'your-token-here',
}
```

### Option C: Set it as an environment variable

```bash
export ARENA_ACCESS_TOKEN=your-token-here
npm run fetch
```

## Troubleshooting

**"Invalid credentials" error?**
Double-check that you copied the full token with no extra spaces.

**"Not Found" error on your username?**
Your Are.na username slug might be different from your display name. Check your profile URL — if it's `are.na/john-doe`, your username is `john-doe`.
