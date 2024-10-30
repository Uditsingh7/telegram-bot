require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoString = 'mongodb+srv://how3:zJA6GKeimXAJJBG8@editorapi.aiarnwk.mongodb.net/bot-telegram?retryWrites=true&w=majority'
const mongoose = require('mongoose');
const User = require('./models/User');
const Task = require('./models/Task');
const Referral = require('./models/Referral');
const Transaction = require('./models/Transaction');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((error) => {
    console.error('MongoDB connection error:', error);
});

// Start command to greet user and prompt to join the channel
bot.onText(/\/start(?: (.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const referralParam = match[1]; // Capture the referral parameter if present

    try {
        // Check if user already exists in the database
        let user = await User.findOne({ userId: chatId });

        // If the user doesn't exist, create a new one
        if (!user) {
            user = new User({ userId: chatId, balance: 100, referrals: 0, completedTasks: [] });
            await user.save();
        }

        // Process referral if a referral parameter exists
        if (referralParam && referralParam.startsWith("referral_")) {
            const referrerId = referralParam.split("_")[1];

            // Ensure the referral is valid and not self-referred
            if (referrerId && referrerId !== chatId.toString()) {
                // Check if this referral has already been processed
                const existingReferral = await Referral.findOne({ referredUserId: chatId });
                if (!existingReferral) {
                    // Save referral record
                    const referral = new Referral({ referrerId, referredUserId: chatId });
                    await referral.save();

                    // Update referrer data
                    const referrer = await User.findOne({ userId: referrerId });
                    if (referrer) {
                        referrer.referrals += 1;
                        const referralPoints = 5; // Points awarded for each referral
                        referrer.balance += referralPoints;
                        await referrer.save();

                        // Notify the referrer about the successful referral
                        bot.sendMessage(referrerId, `🎉 You've earned ${referralPoints} points for referring a new user! Your new balance is ${referrer.balance} points.`);
                    }
                }
            }
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

    } catch (error) {
        console.error("Error in /start command:", error);
        bot.sendMessage(chatId, "⚠️ There was an error setting up your account. Please try again later.");
    }
});



// Handle the "Verify" button and navigate to the main menu if verified
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    console.log(query.data)

    if (query.data === "verify") {
        try {
            // Verify user membership in the main channel
            const chatMember = await bot.getChatMember("@vectoroad", chatId);
            if (["member", "administrator", "creator"].includes(chatMember.status)) {
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

    // Task Verification by Task ID
    if (query.data.startsWith("verify_")) {
        const taskId = query.data.split("_")[1];
        const task = await Task.findById(taskId);

        if (task) {
            // Pass task._id to verifyTaskCompletion, which is the correct ObjectId
            await verifyTaskCompletion(chatId, task._id, task.points);
        } else {
            bot.sendMessage(chatId, "⚠️ Task not found.");
        }
        return;
    }

    // Main Menu and withdrawal setup commands
    switch (query.data) {
        case "main_menu":
            showMainMenu(chatId);
            break;
        case "home":
            showHome(chatId);
            break;
        case "tasks":
            showTasks(chatId);
            break;
        case "refer":
            showRefer(chatId);
            break;

        // Start Withdrawal Setup with database
        case "withdrawal":
            startWithdrawalSetup(chatId);
            break;

        // Show Withdrawal Details, now fetched from MongoDB
        case "view_withdrawal_details":
            const user = await User.findOne({ userId: chatId }) || {};
            const exchangeId = user.withdrawalDetails?.exchangeId || "Not Set";
            const cryptoAddress = user.withdrawalDetails?.cryptoAddress || "Not Set";
            const bankDetails = user.withdrawalDetails?.bankDetails || "Not Set";

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
            bot.once("message", async (msg) => {
                await User.updateOne({ userId: chatId }, { "withdrawalDetails.exchangeId": msg.text }, { upsert: true });
                bot.sendMessage(chatId, "Exchange ID saved! Select another option or return to the main menu.");
                startWithdrawalSetup(chatId);
            });
            break;

        case "set_crypto_address":
            bot.sendMessage(chatId, "Please enter your *Crypto Address*:", { parse_mode: "Markdown" });
            bot.once("message", async (msg) => {
                await User.updateOne({ userId: chatId }, { "withdrawalDetails.cryptoAddress": msg.text }, { upsert: true });
                bot.sendMessage(chatId, "Crypto Address saved! Select another option or return to the main menu.");
                startWithdrawalSetup(chatId);
            });
            break;

        case "set_bank_details":
            bot.sendMessage(chatId, "Please enter your *Bank Details*:", { parse_mode: "Markdown" });
            bot.once("message", async (msg) => {
                await User.updateOne({ userId: chatId }, { "withdrawalDetails.bankDetails": msg.text }, { upsert: true });
                bot.sendMessage(chatId, "Bank Details saved! Select another option or return to the main menu.");
                startWithdrawalSetup(chatId);
            });
            break;

        // Earn Section (Deposit/Withdrawal Handlers for Opportunities)
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

        // default:
        //     bot.sendMessage(chatId, "Please select a valid option.");
        //     break;
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

// Display referral link and referral count
async function showRefer(chatId) {
    try {
        // Retrieve user data from MongoDB
        const user = await User.findOne({ userId: chatId });

        // If user exists, get their referral count; otherwise, set it to 0
        const referrals = user ? user.referrals : 0;

        // Generate the referral link
        const referralLink = `https://t.me/${process.env.BOT_USERNAME}?start=referral_${chatId}`;

        // Construct the referral message
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

    } catch (error) {
        console.error("Error fetching referral data:", error);
        bot.sendMessage(chatId, "⚠️ Unable to fetch your referral data. Please try again later.");
    }
}




// Helper function to verify task completion and reward points
async function verifyTaskCompletion(chatId, taskId, points) {
    try {
        const task = await Task.findById(taskId); // Ensure task ID is fetched as an ObjectId

        if (!task) {
            bot.sendMessage(chatId, "⚠️ Task not found.");
            return;
        }

        const chatMember = await bot.getChatMember(task.channelId, chatId);

        if (["member", "administrator", "creator"].includes(chatMember.status)) {
            // Retrieve user data from MongoDB
            let user = await User.findOne({ userId: chatId });

            if (!user) {
                user = new User({ userId: chatId, balance: 0, referrals: 0, completedTasks: [] });
            }

            // Check if the task was already completed
            if (user.completedTasks.includes(taskId)) {
                bot.sendMessage(chatId, "✅ You have already completed this task.", {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "Back to Task List", callback_data: "tasks" }],
                            [{ text: "Main Menu", callback_data: "main_menu" }]
                        ]
                    }
                });
            } else {
                // Mark task as completed with ObjectId and award points
                user.completedTasks.push(task._id); // Ensure task._id is stored as ObjectId
                user.balance += points;
                await user.save();

                bot.sendMessage(chatId, `🎉 Task completed! You've earned ${points} points. Your new balance is ${user.balance} points.`, {
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
async function showHome(chatId) {
    try {
        // Retrieve user data from MongoDB
        const user = await User.findOne({ userId: chatId });
        const balance = user ? user.balance : 0; // Default to 0 if user not found

        // Home page message with user's balance
        const homeMessage = `
        🏠 *Home Page*
        
        💰 *Your Current Balance:* ${balance} points
        
        📢 *Promote Your Ad!* Click below to view our ad channel for more info.
        `;

        const options = {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Visit Ad Channel", url: "https://t.me/vectoroad" }], // Replace with your ad channel link
                    [{ text: "Back to Main Menu", callback_data: "main_menu" }]
                ]
            }
        };

        bot.sendMessage(chatId, homeMessage, options);

    } catch (error) {
        console.error("Error fetching user balance:", error);
        bot.sendMessage(chatId, "⚠️ Unable to fetch your balance. Please try again later.");
    }
}


// Import Task model
async function showTasks(chatId) {
    try {
        // Fetch tasks from MongoDB
        const tasks = await Task.find({});

        // Build the tasks message dynamically
        let tasksMessage = `📋 *Tasks*\n\nComplete the following tasks to earn points:\n\n`;

        // Generate task buttons and messages dynamically from the database
        const taskButtons = tasks.map(task => [
            { text: `Verify ${task.name}`, callback_data: `verify_${task._id}` }
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

    } catch (error) {
        console.error("Error fetching tasks:", error);
        bot.sendMessage(chatId, "⚠️ Unable to fetch tasks. Please try again later.");
    }
}
