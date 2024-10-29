require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Mock storage for user data in this demo
const userData = {};


// mock tasks here
const tasks = [
    { id: "task_1", name: "Join Channel vectoroad", description: "Join this channel to earn points.", channelId: "@vectoroad", points: 10 },
    { id: "task_2", name: "Join Channel testVectoroad", description: "Join this second channel for more points.", channelId: "@testVectoroad", points: 15 }
    // Add more tasks here if needed
];

// Start command to greet user and prompt to join the channel
bot.onText(/\/start(?: (.*))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const referralParam = match[1]; // Capture the referral parameter if present

    // Check if the start parameter is a referral link
    if (referralParam && referralParam.startsWith("referral_")) {
        const referrerId = referralParam.split("_")[1];

        // Only process if the referrer is not the same as the new user
        if (referrerId && referrerId !== chatId.toString()) {
            if (!userData[referrerId]) {
                userData[referrerId] = { balance: 100, referrals: 0, completedTasks: [] }; // Initialize referrer data if not already present
            }

            // Increment the referrer's referral count and award points
            userData[referrerId].referrals += 1;
            const referralPoints = 5; // Example points for each referral
            userData[referrerId].balance += referralPoints;

            // Notify the referrer about the successful referral
            bot.sendMessage(referrerId, `🎉 You've earned ${referralPoints} points for referring a new user! Your new balance is ${userData[referrerId].balance} points.`);
        }
    }

    // Save or initialize user data for the new user
    if (!userData[chatId]) {
        userData[chatId] = { balance: 100, referrals: 0, completedTasks: [] };
    }

    // Show welcome message and prompt to join the official channel
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
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;

    if (query.data === "verify") {
        try {
            // Use getChatMember to check if user is a member of the official channel
            const chatMember = await bot.getChatMember("@vectoroad", chatId);

            // Check if the user is a member of the channel
            if (chatMember.status === "member" || chatMember.status === "administrator" || chatMember.status === "creator") {
                bot.sendMessage(chatId, "✅ Verification successful! Welcome to EarnHub Bot.");
                showMainMenu(chatId);
            } else {
                bot.sendMessage(chatId, "🚫 Please join the channel before proceeding.");
            }
        } catch (error) {
            console.error("Error verifying user:", error);
            bot.sendMessage(chatId, "⚠️ Unable to verify. Please try again later.");
        }
        return;
    }

    // Check if the query data matches a dynamic task ID
    const task = tasks.find(task => `verify_${task.id}` === query.data);

    if (task) {
        await verifyTaskCompletion(chatId, task.channelId, task.points);
        return; // Stop further processing after task verification
    } else if (query.data === "main_menu") {
        showMainMenu(chatId);
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

        // Start the guided Withdrawal setup
        case "withdrawal":
            startWithdrawalSetup(chatId);
            break;

        // Step-by-Step Withdrawal Options
        case "view_withdrawal_details":
            // Fetch user details or show "Not Set" if missing
            const userDetails = userData[chatId] || {};
            const exchangeId = userDetails.exchangeId || "Not Set";
            const cryptoAddress = userDetails.cryptoAddress || "Not Set";
            const bankDetails = userDetails.bankDetails || "Not Set";

            const detailsMessage = `
            📄 *Your Withdrawal Details*
            
            - *Exchange ID*: ${exchangeId}
            - *Crypto Address*: ${cryptoAddress}
            - *Bank Details*: ${bankDetails}

            You can update any of these details from the options below.
            `;

            bot.sendMessage(chatId, detailsMessage, {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Back to Withdrawal Setup", callback_data: "withdrawal" }]
                    ]
                }
            });
            break;

        case "set_exchange_id":
            bot.sendMessage(chatId, "Please enter your *Exchange ID*:", { parse_mode: "Markdown" });
            bot.once("message", (msg) => {
                userData[chatId].exchangeId = msg.text;
                bot.sendMessage(chatId, "Exchange ID saved! Select another option or return to the main menu.");
                startWithdrawalSetup(chatId);
            });
            break;

        case "set_crypto_address":
            bot.sendMessage(chatId, "Please enter your *Crypto Address*:", { parse_mode: "Markdown" });
            bot.once("message", (msg) => {
                userData[chatId].cryptoAddress = msg.text;
                bot.sendMessage(chatId, "Crypto Address saved! Select another option or return to the main menu.");
                startWithdrawalSetup(chatId);
            });
            break;

        case "set_bank_details":
            bot.sendMessage(chatId, "Please enter your *Bank Details*:", { parse_mode: "Markdown" });
            bot.once("message", (msg) => {
                userData[chatId].bankDetails = msg.text;
                bot.sendMessage(chatId, "Bank Details saved! Select another option or return to the main menu.");
                startWithdrawalSetup(chatId);
            });
            break;
        case "deposit_opportunity_a":
            handleDeposit(chatId, "Opportunity A");
            break;

        case "withdraw_opportunity_a":
            handleWithdrawal(chatId, "Opportunity A");
            break;

        case "deposit_opportunity_b":
            handleDeposit(chatId, "Opportunity B");
            break;

        case "withdraw_opportunity_b":
            handleWithdrawal(chatId, "Opportunity B");
            break;

        case "confirm_deposit_opportunity_a":
        case "confirm_deposit_opportunity_b":
            bot.sendMessage(chatId, "✅ Your deposit has been confirmed. Thank you!");
            break;

        case "confirm_withdrawal_opportunity_a":
        case "confirm_withdrawal_opportunity_b":
            bot.sendMessage(chatId, "✅ Your withdrawal request has been submitted. It will be processed within a week.");
            break;

        case "earn":
            showEarn(chatId);
            break;

        default:
            bot.sendMessage(chatId, "Please select a valid option.");
            break;
    }
});

// Display Earn Section with Opportunities
function showEarn(chatId) {
    const earnMessage = `
    💰 *Earning Opportunities*

    Here are some ways you can earn with us:

    1️⃣ *Opportunity A* - Earn rewards by depositing to our platform.
    2️⃣ *Opportunity B* - Grow your balance with deposits and withdrawals.

    Select an option below to deposit or withdraw.
    `;

    const options = {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "Deposit to Opportunity A", callback_data: "deposit_opportunity_a" }],
                [{ text: "Withdraw from Opportunity A", callback_data: "withdraw_opportunity_a" }],
                [{ text: "Deposit to Opportunity B", callback_data: "deposit_opportunity_b" }],
                [{ text: "Withdraw from Opportunity B", callback_data: "withdraw_opportunity_b" }],
                [{ text: "Back to Main Menu", callback_data: "main_menu" }]
            ]
        }
    };

    bot.sendMessage(chatId, earnMessage, options);
}

// Handle Deposit Flow
function handleDeposit(chatId, opportunity) {
    // Static address and user-specific memo
    const depositAddress = "0xYourStaticDepositAddress";
    const memo = chatId; // Unique memo for tracking the user's deposit

    const depositMessage = `
    🏦 *Deposit to ${opportunity}*

    Send your deposit to the address below:
    - Address: \`${depositAddress}\`
    - Memo: \`${memo}\` (Use this memo to identify your deposit)

    Once sent, please let us know by clicking "Confirm Deposit."
    `;

    const options = {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "Confirm Deposit", callback_data: `confirm_deposit_${opportunity.toLowerCase()}` }],
                [{ text: "Back to Earn Section", callback_data: "earn" }]
            ]
        }
    };

    bot.sendMessage(chatId, depositMessage, options);
}

// Handle Withdrawal Flow
function handleWithdrawal(chatId, opportunity) {
    const withdrawalMessage = `
    💸 *Withdrawal Request for ${opportunity}*

    Your current balance for ${opportunity} will be processed for withdrawal. 
    Withdrawals are processed weekly.

    Click "Confirm Withdrawal" to proceed.
    `;

    const options = {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "Confirm Withdrawal", callback_data: `confirm_withdrawal_${opportunity.toLowerCase()}` }],
                [{ text: "Back to Earn Section", callback_data: "earn" }]
            ]
        }
    };

    bot.sendMessage(chatId, withdrawalMessage, options);
}




// Updated startWithdrawalSetup to include the "View Details" option
function startWithdrawalSetup(chatId) {
    const initialMessage = `
    💸 *Withdrawal Setup*

    Please select the type of detail you want to add or update:
    1️⃣ Exchange ID
    2️⃣ Crypto Address
    3️⃣ Bank Details

    Select an option below to continue, or view your saved details.
    `;

    const options = {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "Exchange ID", callback_data: "set_exchange_id" }],
                [{ text: "Crypto Address", callback_data: "set_crypto_address" }],
                [{ text: "Bank Details", callback_data: "set_bank_details" }],
                [{ text: "View Withdrawal Details", callback_data: "view_withdrawal_details" }],
                [{ text: "Back to Main Menu", callback_data: "main_menu" }]
            ]
        }
    };

    bot.sendMessage(chatId, initialMessage, options);
}

// Handle each step of the input
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;

    switch (query.data) {
        case "main_menu":
            showMainMenu(chatId);
            break;
    }
});



// Display referral link and referral count
function showRefer(chatId) {
    const referralLink = `https://t.me/${process.env.BOT_USERNAME}?start=referral_${chatId}`;
    const referrals = userData[chatId]?.referrals || 0;

    const referMessage = `
    🔗 *Refer and Earn*
    
    Share your unique referral link to earn points for every new user who joins:
    \`${referralLink}\`  👈 Copy this link and share it!

    Total Referrals: ${referrals}
    `;

    const options = {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: [
                [{ text: "Back to Main Menu", callback_data: "main_menu" }]
            ]
        }
    };

    bot.sendMessage(chatId, referMessage, options);
}



// Helper function to verify task completion and reward points
async function verifyTaskCompletion(chatId, channelId, points) {
    try {
        const chatMember = await bot.getChatMember(channelId, chatId);

        if (["member", "administrator", "creator"].includes(chatMember.status)) {
            // Initialize completedTasks array if it doesn't exist
            if (!userData[chatId].completedTasks) {
                userData[chatId].completedTasks = [];
            }

            // Check if the task was already completed
            if (userData[chatId].completedTasks.includes(channelId)) {
                bot.sendMessage(chatId, "✅ You have already completed this task.", {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "Back to Task List", callback_data: "tasks" }],
                            [{ text: "Main Menu", callback_data: "main_menu" }]
                        ]
                    }
                });
            } else {
                // Mark task as completed and award points
                userData[chatId].completedTasks.push(channelId);
                userData[chatId].balance += points;
                bot.sendMessage(chatId, `🎉 Task completed! You've earned ${points} points. Your new balance is ${userData[chatId].balance} points.`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "Back to Task List", callback_data: "tasks" }],
                            [{ text: "Main Menu", callback_data: "main_menu" }]
                        ]
                    }
                });
            }
        } else {
            bot.sendMessage(chatId, "🚫 Please join the task channel to claim your reward.", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Back to Task List", callback_data: "tasks" }],
                        [{ text: "Main Menu", callback_data: "main_menu" }]
                    ]
                }
            });
        }
    } catch (error) {
        console.error("Error verifying task completion:", error);
        bot.sendMessage(chatId, "⚠️ Unable to verify task completion. Please try again later.", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Back to Task List", callback_data: "tasks" }],
                    [{ text: "Main Menu", callback_data: "main_menu" }]
                ]
            }
        });
    }
}


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
    🏠 *Home Page*
    
    💰 *Your Current Balance:* ${balance} points
    
    📢 *Promote Your Ad!* Click below to view our ad channel for more info.
    `;

    const options = {
        parse_mode: "Markdown",  // This enables bold and formatting
        reply_markup: {
            inline_keyboard: [
                [{ text: "Visit Ad Channel", url: "https://t.me/vectoroad" }], // Replace with your ad channel link
                [{ text: "Back to Main Menu", callback_data: "main_menu" }]
            ]
        }
    };

    bot.sendMessage(chatId, homeMessage, options);
}

function showTasks(chatId) {
    // Build the tasks message dynamically
    let tasksMessage = `📋 *Tasks*\n\nComplete the following tasks to earn points:\n\n`;

    const taskButtons = tasks.map(task => [
        { text: `Verify ${task.name}`, callback_data: `verify_${task.id}` }
    ]);

    tasks.forEach(task => {
        tasksMessage += `🔹 *${task.name}* - Earn ${task.points} points\n👉 *Description*: ${task.description}\n\n`;
    });

    tasksMessage += "After joining, click the corresponding 'Verify' button below to claim your points.";

    const options = {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: [
                ...taskButtons,
                [{ text: "Back to Main Menu", callback_data: "main_menu" }]
            ]
        }
    };

    bot.sendMessage(chatId, tasksMessage, options);
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
