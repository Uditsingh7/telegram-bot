require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Mock storage for user data in this demo
const userData = {};

// Start command to greet user and prompt to join the channel
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    // Save user ID and initial balance in userData object
    userData[chatId] = { balance: 100, referrals: 0 }; // Sample balance for demo

    const welcomeMessage = `
    👋 Welcome to EarnHub Bot!

    To get started, please join our official channel:
    👉 https://t.me/+UGrtv9SSttlhZmU1

    Once you've joined, click "Verify" below to continue.
    `;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Verify", callback_data: "verify" }] // Verify button
            ]
        }
    };

    bot.sendMessage(chatId, welcomeMessage, options);
});

// Handle the "Verify" button and navigate to the main menu if verified
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;

    if (query.data === "verify") {
        const isJoined = true; // Simulate verification (replace with actual logic)

        if (isJoined) {
            bot.sendMessage(chatId, "✅ Verification successful! Welcome to EarnHub Bot.");
            showMainMenu(chatId);
        } else {
            bot.sendMessage(chatId, "🚫 Please join the channel before proceeding.");
        }
        return;
    }

    // Switch for other menu options
    switch (query.data) {
        case "home":
            showHome(chatId);
            break;
        case "tasks":
            showTasks(chatId);
            break;
        case "refer":
            showRefer(chatId);
            break;
        case "withdrawal":
            showWithdrawal(chatId);
            break;
        case "earn":
            showEarn(chatId);
            break;
        case "main_menu":
            showMainMenu(chatId);
            break;
        default:
            bot.sendMessage(chatId, "Please select a valid option.");
            break;
    }
});

// Function to show the main menu
function showMainMenu(chatId) {
    const menuMessage = `
    🎉 Main Menu
    Select an option below:
    `;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Home", callback_data: "home" }],
                [{ text: "Tasks", callback_data: "tasks" }],
                [{ text: "Refer and Earn", callback_data: "refer" }],
                [{ text: "Withdrawal", callback_data: "withdrawal" }],
                [{ text: "Earn", callback_data: "earn" }]
            ]
        }
    };

    bot.sendMessage(chatId, menuMessage, options);
}

// Individual section functions with Back to Main Menu button
function showHome(chatId) {
    const balance = userData[chatId].balance;
    const homeMessage = `
    🏠 Home
    Your Current Balance: ${balance} points.
    Want to earn more? Explore other options.
    `;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Back to Main Menu", callback_data: "main_menu" }]
            ]
        }
    };

    bot.sendMessage(chatId, homeMessage, options);
}

function showTasks(chatId) {
    const tasksMessage = `
    📋 Tasks
    Task: Join Channel XYZ
    Earn 10 points upon completion.
    Click "Back to Main Menu" when done.
    `;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Back to Main Menu", callback_data: "main_menu" }]
            ]
        }
    };

    bot.sendMessage(chatId, tasksMessage, options);
}

function showRefer(chatId) {
    const referralLink = `https://t.me/EarnHubBot?start=${chatId}`;
    const referMessage = `
    🔗 Refer and Earn
    Share your unique link to earn points:
    ${referralLink}
    Total Referrals: ${userData[chatId].referrals}
    `;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Back to Main Menu", callback_data: "main_menu" }]
            ]
        }
    };

    bot.sendMessage(chatId, referMessage, options);
}

function showWithdrawal(chatId) {
    const withdrawalMessage = `
    💸 Withdrawal
    Set up weekly withdrawals by entering your wallet address.
    Example: Type "Set Wallet <your_wallet_address>"
    `;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Back to Main Menu", callback_data: "main_menu" }]
            ]
        }
    };

    bot.sendMessage(chatId, withdrawalMessage, options);
}

function showEarn(chatId) {
    const earnMessage = `
    💰 Earn Opportunities
    Opportunity: High Yield Deposit
    Deposit Address: 0xYourMockAddressHere
    Memo: ${chatId}
    `;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Back to Main Menu", callback_data: "main_menu" }]
            ]
        }
    };

    bot.sendMessage(chatId, earnMessage, options);
}
