I need to create a study companion. I study on my laptop but often I don't have access to it (while traveling e.g.) and have to rely on phone where it is cumbersome. I have my existing notes written in word document which is uploaded to one drive.

Create an app which I can use on both my laptop and my phone. It can connect to one drive and allow me to create notes or make the notes accessible. It can generate quizes for me on the notes I have written and also help me update notes or ask clarifying questions. The current notes are in word documents.

I watch a lot of youtube content, may be it can extract transcripts from youtube video and create a notes and can quiz me on it. I watch playlist like Standford AI lectures so may be one note / folder of notes per playlist.

Also suggest other features which I could include to make this app more useful.

We must use Google Gemini models for all features (with free account restrictions) and vercel to host the application (free tier: https://vercel.com/pricing)Can you update the requirements accordingly. the backend has to be in python, front end can be anything.

Use the youtube-transcript-api python package to instantly fetch subtitles from any video URL without needing the official, restrictive YouTube Data API.

Flashcards & MCQs: Send the parsed document text to an LLM with a strict prompt: "Generate 5 multiple-choice questions and 5 active recall flashcards based strictly on this text. Return the output in structured JSON format."

Spaced Repetition System (SRS): Don't just quiz yourself randomly. Implement an algorithm like SM-2 (used by Anki). The app will automatically track which quiz questions or flashcards you struggle with and surface them right before your brain is about to forget them.

Offline First Cache: Since you travel often, ensure that whenever the app has internet, it downloads the text of your notes and generated quizzes into a local SQLite/Isar database. You can study, review, and take quizzes entirely offline, and sync your progress back to OneDrive once you're reconnected.

Adapting Core Features for Vercel & Gemini. Handling the Vercel Serverless Constraints (Crucial)Vercel's free tier has a 10-second execution timeout for Serverless Functions. Heavy tasks like parsing giant .docx files or fetching multi-hour YouTube transcripts will crash if done synchronously.The Fix: Split tasks into micro-requests. Instead of processing a whole YouTube playlist at once, your frontend should call the API endpoint one video at a time using a loop.2. YouTube Transcripts on VercelStandard Python libraries like youtube-transcript-api cannot run directly in standard Node.js serverless functions without extra configuration.Solution: Use Node-native npm packages like youtube-transcript or youtubei.js inside your Next.js API routes (/api/transcript) to fetch the transcript directly in JavaScript.3. Utilizing Gemini Structured OutputsGemini excels at returning clean data when instructed properly. When generating quizzes, you can pass a schema to the API so it guarantees a pristine JSON response, preventing formatting bugs.

Offline Access: Utilize Progressive Web App (PWA) configurations in Next.js. This allows you to "install" the website onto your phone's home screen. It will use local browser storage (IndexedDB) to cache your notes, letting you read them even while offline on flights.

Handling Vercel Free-Tier LimitationsBecause you are using a Python backend on Vercel’s free tier, keep these constraints in mind:The 60-Second Execution Limit: Vercel allows a maximum of 60 seconds for a function to execute on the free tier.The YouTube Problem: Getting an entire playlist's transcripts and passing it to Gemini all at once will easily exceed 60 seconds and cause a 504 Timeout.The Solution: Keep the Python endpoints micro-scoped. Have your React app loop through the playlist URLs on the frontend, hitting a /api/transcript endpoint one video at a time.
Stateless Nature: Vercel Serverless Functions do not maintain local storage between hits. Every time React makes a call, the Python script spins up fresh.Therefore, authentication states (like your Microsoft Graph OAuth tokens for OneDrive) should be stored in browser localStorage or a lightweight free database (like Supabase or Vercel KV) rather than memory variables inside Python. 

If docx is hard to parse or extract text, suggest markdown as alternative.

Can you come up with the high level architecture diagrams for this application.
Generate all the design documents at this location:
documentation/design/high_level
