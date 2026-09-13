# FocusFox

A Chrome Manifest V3 extension that blocks distracting social sites and connects to DeepSeek for AI-powered homework help.

## Features

- Blocks common social media sites by default
- Add or remove any domain from the block list
- One-click pause switch
- Optional ad blocker for common advertising domains, independent of social blocking
- Quick ad blocker toggle directly in the popup
- Homework completion counter and progress bar
- Copy or clear quick notes, with Undo clear available even after reopening the popup (until you type new notes)
- Reopens your last-used Helper, Tasks, or Timer tab; completed snips open in Helper
- Friendly blocked page instead of a browser error
- AI explanations, hints, full solutions, and answer checking for Math, Science, English, History, and other subjects
- Optional current-page analysis using selected text, visible page text, and a screenshot of the visible tab
- Snipping tool: drag a box around one problem and receive an AI explanation when it finishes
- Daily streaks for completed focus sessions and rotating motivational lines
- Copy AI answers with one click and clear completed homework tasks
- Continue an AI answer with follow-up questions without restarting
- Optional daily blocking hours, including overnight schedules
- A 30-second emergency-unlock delay that requires a reason
- Homework due dates with an 8:00 AM reminder on the due date
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

To enable ad blocking, open **Settings & API key**, turn on **Block ads** under **Ad blocker**, and click **Save changes**. Reload open pages afterward. It is off by default and stays enabled even when social blocking is paused or outside scheduled hours. Uncheck it and save to turn it off if a site stops working.

The ad blocker uses a small built-in domain list in `rules/ads.json`; it does not download filter lists. It blocks ad network requests, but does not remove empty ad spaces or guarantee blocking of all ads, especially ads served by the site itself or video ads. Rules use Chrome's [declarativeNetRequest API](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest).

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
