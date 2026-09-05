# FocusFox

A Chrome Manifest V3 extension that blocks distracting social sites and connects to DeepSeek for AI-powered homework help.

## Features

- Blocks common social media sites by default
- Add or remove any domain from the block list
- One-click pause switch
- Friendly blocked page instead of a browser error
- AI explanations, hints, full solutions, and answer checking for Math, Science, English, History, and other subjects
- Optional current-page analysis using selected text, visible page text, and a screenshot of the visible tab
- Snipping tool: drag a box around one problem and receive an AI explanation when it finishes
- Daily streaks for completed focus sessions and rotating motivational lines
- Copy AI answers with one click and clear completed homework tasks
- Homework task list, scratchpad, and 15/25/45-minute focus timer
- Your settings stay on your device; AI questions are sent to DeepSeek using your own API key

## Install in Google Chrome

1. Unzip `FocusFox.zip`.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Select the unzipped `FocusFox` folder.
6. Pin FocusFox from Chrome's puzzle-piece menu.

To change the blocked sites, open the extension and click **Edit blocked sites**.

## Connect DeepSeek

1. Open FocusFox and click **Settings & API key**.
2. Paste your DeepSeek API key into the password field.
3. Choose V4 Flash for speed or V4 Pro for stronger answers.
4. Click **Save changes**.
5. Return to the Helper tab, choose the type of help, and ask a question.

To use a problem already open in Chrome, select the relevant text if possible, open FocusFox, and click **Analyze current page**. FocusFox attaches the selected text (or visible page text) plus a screenshot of the visible tab. Add an instruction such as “solve question 4” and click **Ask FocusFox AI**.

For a specific visual problem, choose your subject and help mode, click **Snip problem**, and drag a box around the question. FocusFox analyzes only the cropped image. Reopen the popup when Chrome shows the completion notification.

## Note

This build is for personal use. The API key is stored in your local Chrome profile and is never included in the ZIP, but someone with access to your Chrome profile may be able to extract it. Homework questions and any explicitly attached page text/screenshot are sent to DeepSeek to generate answers. A public Web Store release should use a server-side API proxy and updated privacy disclosures.
