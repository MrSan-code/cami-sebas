# Guest photo uploads (Google Drive)

`QR/fotos/` sends each guest file to a Google Drive account through this
Apps Script web app. Files are stored at full quality in
`Fotos boda Cami & Sebas/<guest name>/`, visible only to the account owner.

The page tries the accounts listed in `DRIVES` (`QR/fotos/fotos.js`) in order
and uses the first one with enough free space for the file.

## Add another account

1. Turn on "Google Apps Script API" at https://script.google.com/home/usersettings with the new account.
2. From this folder (move the current `.clasp.json` aside first):

   ```sh
   npx @google/clasp login            # sign in with the new account
   npx @google/clasp create-script --type standalone --title "Fotos boda Cami & Sebas" --rootDir .
   git checkout appsscript.json       # create-script overwrites the manifest
   npx @google/clasp push --force
   npx @google/clasp create-deployment --description "v1"
   ```

3. Open the script in the editor, run `setup` once and allow the permissions.
4. Append `https://script.google.com/macros/s/<deployment id>/exec` to `DRIVES`.

## Update the code

`npx @google/clasp push --force` then
`npx @google/clasp update-deployment <deployment id>` so the live URL keeps working.

## Connected accounts

| clasp user | Account | Project file |
|---|---|---|
| default | tundamalabs@gmail.com | `.clasp.json` |
| cuenta2 | contacto.tundamalabs@gmail.com | `.clasp.cuenta2.json` |
| cuenta3 | trashtomymail@gmail.com | `.clasp.cuenta3.json` |

Push to one of them with `npx @google/clasp --user cuenta2 -P .clasp.cuenta2.json push --force`.
The project files are gitignored; each one only holds that account's script id.
