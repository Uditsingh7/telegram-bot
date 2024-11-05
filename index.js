require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const User = require('./models/User');
const Task = require('./models/Task');
const Referral = require('./models/Referral');
const Transaction = require('./models/Transaction');
const Settings = require('./models/Settings');
const EarningOpportunity = require('./models/EarnOpportunity')

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

        // If the user doesn't exist, create a new one with a default role of 'user'
        if (!user) {
            user = new User({
                userId: chatId,
                username: msg.from.username || 'N/A',
                firstName: msg.from.first_name || 'N/A',
                lastName: msg.from.last_name || 'N/A',
                balance: 100,
                referrals: 0,
                completedTasks: [],
                role: 'user'
            });
            await user.save();
        }

        // Process referral if a referral parameter exists
        if (referralParam && referralParam.startsWith("referral_")) {
            const referrerId = referralParam.split("_")[1];
            const referPoints = await Settings.findOne({ key: "referral_points" })

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
                        const referralPoints = referPoints?.value || 5; // Points awarded for each referral
                        referrer.balance += referralPoints;
                        await referrer.save();

                        // Notify the referrer about the successful referral
                        bot.sendMessage(referrerId, `🎉 You've earned ${referralPoints} points for referring a new user! Your new balance is ${referrer.balance} points.`);
                    }
                }
            }
        }

        // Check the user's role and display the appropriate dashboard
        if (user.role === 'admin') {
            // Show admin dashboard
            bot.sendMessage(chatId, "👋 Welcome, Admin! Access your dashboard below.", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "User Stats", callback_data: "admin_user_stats" }],
                        [{ text: "Manage Home Page", callback_data: "admin_manage_home" }],
                        [{ text: "Manage Tasks", callback_data: "admin_manage_tasks" }],
                        [{ text: "Referral Management", callback_data: "admin_referrals" }],
                        [{ text: "Manage Withdrawals", callback_data: "admin_withdrawals" }],
                        [{ text: "Earn Opportunities", callback_data: "admin_earn" }]
                    ]
                }
            });
        } else {
            // Fetch the official channel link from Settings
            const channelSetting = await Settings.findOne({ key: 'officialChannelLink' });
            const channelLink = channelSetting ? channelSetting.value.channelLink : 'https://t.me';
            // Show standard user welcome message and prompt to join the official channel

            const channelLogo = await Settings.findOne({ key: 'channelLogoImage' })
            const welcomeMessage = `
            👋 Welcome to EarnHub Bot!

To get started, please join our official channel:
            👉 ${channelLink}

Once you've joined, click "Verify" below to continue.
            `;

            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Verify", callback_data: "verify" }] // Verify button
                    ]
                }
            };
            // Send image first
            bot.sendPhoto(chatId, channelLogo.value, {
                caption: welcomeMessage,
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Verify", callback_data: "verify" }],
                    ]
                }
            });


            // bot.sendMessage(chatId, welcomeMessage, options);
        }

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
            const channelSetting = await Settings.findOne({ key: 'officialChannelLink' });
            const channelUsername = channelSetting ? channelSetting.value.channelUsername : '@v';
            // Verify user membership in the main channel
            const chatMember = await bot.getChatMember(`${channelUsername}`, chatId);
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

        case "earn":
            showEarnOpportunities(chatId);
            break;

        // Admin shorcts
        case "admin_user_stats":
            await showUserStats(chatId);
            break;

        case "admin_withdrawals":
            bot.sendMessage(chatId, "Enter the new withdrawal currency symbol:", { parse_mode: "Markdown" });
            bot.once("message", async (msg) => {
                const currency = msg.text.trim();
                await Settings.updateOne({ key: "withdrawal_currency" }, { value: currency }, { upsert: true });
                bot.sendMessage(chatId, `✅ Withdrawal currency updated to ${currency}`);
            });
            break;

        case "admin_earn":
            await showManageWithdrawalsMenu(chatId)
            break;

        case "admin_dashboard":
            // Re-display the admin dashboard

            bot.sendMessage(chatId, "👋 Welcome back, Admin! Access your dashboard below.", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "User Stats", callback_data: "admin_user_stats" }],
                        [{ text: "Manage Home Page", callback_data: "admin_manage_home" }],
                        [{ text: "Manage Tasks", callback_data: "admin_manage_tasks" }],
                        [{ text: "Referral Management", callback_data: "admin_referrals" }],
                        [{ text: "Manage Withdrawals", callback_data: "admin_withdrawals" }],
                        [{ text: "Earn Opportunities", callback_data: "admin_earn" }]
                    ]
                }
            });
            break;
        case 'admin_manage_home':
            showManageHome(chatId);
            break;

        case 'admin_manage_tasks':
            showManageTasks(chatId);
            break;

        case "admin_edit_ad_title":
            handleEditAdTitle(chatId);
            break;

        case "admin_edit_ad_description":
            handleEditAdDescription(chatId);
            break;

        case "admin_edit_ad_link":
            handleEditAdLink(chatId);
            break;

        case "admin_edit_main_logo":
            handleEditMainLogo(chatId);
            break;

        case "admin_referrals":
            bot.sendMessage(chatId, "Enter the new referral points:", { parse_mode: "Markdown" });
            bot.once("message", async (msg) => {
                const points = parseInt(msg.text, 10);
                await Settings.updateOne({ key: "referral_points" }, { value: points });
                bot.sendMessage(chatId, `✅ Referral points updated to ${points}`);
            });
            break;
        case "admin_add_task":
            addNewTask(chatId); // Start task creation flow
            break;

        case "admin_edit_task":
            showEditTaskMenu(chatId); // Show menu to select task for editing
            break;

        case "admin_delete_task":
            deleteTask(chatId); // Show menu to select task for deletion
            break;
        case "add_earning_opportunity":
            await promptAddEarningOpportunity(chatId);
            break;
        case "delete_earning_opportunity":
            await promptDeleteEarningOpportunity(chatId);
            break;
        case "edit_earning_opportunity":
            await promptEditEarningOpportunity(chatId);
            break;
        default:
            const data = query.data;

            if (data.startsWith("deposit_")) {
                const opportunityId = data.split("_")[1];
                await handleDeposit(chatId, opportunityId);
            } else if (data.startsWith("withdraw_")) {
                const opportunityId = data.split("_")[1];
                await handleWithdrawal(chatId, opportunityId);
            } else if (data.startsWith("confirm_deposit_")) {
                const opportunityId = data.split("_")[2];
                await confirmDeposit(chatId, opportunityId);
            } else if (data.startsWith("confirm_withdrawal_")) {
                const opportunityId = data.split("_")[2];
                await confirmWithdrawal(chatId, opportunityId);
            }
            if (query.data.startsWith("edit_task_")) {
                const taskId = query.data.split("edit_task_")[1];
                editTask(chatId, taskId); // Open specific task for editing
            } else if (query.data.startsWith("delete_task_")) {
                const taskId = query.data.split("_")[2];
                confirmDeleteTask(chatId, taskId); // Confirm task deletion
            }
            if (data.startsWith('delete_opportunity_')) {
                const opportunityId = data.split('_')[2];
                await deleteEarningOpportunity(chatId, opportunityId);
            }
            // Check if the callback data indicates an edit opportunity action
            if (data.startsWith('edit_opportunity_')) {
                const opportunityId = data.split('_')[2];
                await showEditableFields(chatId, opportunityId);
            }

            // Check if the callback data indicates an edit opportunity field action
            if (data.startsWith('edit_field_opportunity_')) {
                const parts = data.split('_');
                console.log("parts: ", parts)
                const field = parts[3]; // Extract the field to be edited
                const opportunityId = parts[4]; // Extract the opportunity ID
                await promptForNewValue(chatId, opportunityId, field);
            }

            break;
    }
});

// Function to prompt the admin to edit an earning opportunity
async function promptEditEarningOpportunity(chatId) {
    try {
        // Fetch all earning opportunities
        const opportunities = await EarningOpportunity.find({});

        // Check if there are any opportunities
        if (opportunities.length === 0) {
            bot.sendMessage(chatId, "⚠️ No earning opportunities found.");
            return;
        }

        // Construct a list of opportunities as inline keyboard buttons
        let message = "Select an earning opportunity to edit:";
        const inlineKeyboard = opportunities.map(opportunity => [
            { text: opportunity.name, callback_data: `edit_opportunity_${opportunity._id}` }
        ]);

        const options = {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: inlineKeyboard }
        };

        bot.sendMessage(chatId, message, options);
    } catch (error) {
        console.error("Error fetching earning opportunities:", error);
        bot.sendMessage(chatId, "⚠️ Unable to fetch earning opportunities. Please try again later.");
    }
}


// Function to show editable fields for the selected opportunity
async function showEditableFields(chatId, opportunityId) {
    const opportunity = await EarningOpportunity.findById(opportunityId);

    if (!opportunity) {
        bot.sendMessage(chatId, "⚠️ Earning opportunity not found.");
        return;
    }

    const options = {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                // [{ text: `Edit Name (Current: ${opportunity.name})`, callback_data: `edit_field_opportunity_name_${opportunityId}` }],
                // [{ text: `Edit Description (Current: ${opportunity.description})`, callback_data: `edit_field_opportunity_description_${opportunityId}` }],
                // [{ text: `Edit Address (Current: ${opportunity.address})`, callback_data: `edit_field_opportunity_address_${opportunityId}` }],
                // [{ text: `Edit QR Code Link (Current: ${opportunity.qrCodeLink || "Not set"})`, callback_data: `edit_field_opportunity_qrCodeLink_${opportunityId}` }],
                // [{ text: `Edit Currency (Current: ${opportunity.currency})`, callback_data: `edit_field_opportunity_currency_${opportunityId}` }],
                // [{ text: `Edit Min Deposit (Current: ${opportunity.minDeposit})`, callback_data: `edit_field_opportunity_minDeposit_${opportunityId}` }],
                // [{ text: `Edit Min Withdrawal (Current: ${opportunity.minWithdrawal})`, callback_data: `edit_field_opportunity_minWithdrawal_${opportunityId}` }],
                // [{ text: `Edit Processing Time (Current: ${opportunity.processingTime})`, callback_data: `edit_field_opportunity_processingTime_${opportunityId}` }],
                // [{ text: `Edit Confirmation Message (Current: ${opportunity.confirmMessage || "Default message"})`, callback_data: `edit_field_opportunity_confirmMessage_${opportunityId}` }],
                // [{ text: "⬅️ Back to Manage Withrawals", callback_data: "admin_earn" }]
                [{ text: `Edit Name`, callback_data: `edit_field_opportunity_name_${opportunityId}` }],
                [{ text: `Edit Description`, callback_data: `edit_field_opportunity_description_${opportunityId}` }],
                [{ text: `Edit Address`, callback_data: `edit_field_opportunity_address_${opportunityId}` }],
                [{ text: `Edit QR Code Link`, callback_data: `edit_field_opportunity_qrCodeLink_${opportunityId}` }],
                [{ text: `Edit Currency`, callback_data: `edit_field_opportunity_currency_${opportunityId}` }],
                [{ text: `Edit Min Deposit`, callback_data: `edit_field_opportunity_minDeposit_${opportunityId}` }],
                [{ text: `Edit Min Withdrawal`, callback_data: `edit_field_opportunity_minWithdrawal_${opportunityId}` }],
                [{ text: `Edit Processing Time`, callback_data: `edit_field_opportunity_processingTime_${opportunityId}` }],
                [{ text: `Edit Confirmation Message`, callback_data: `edit_field_opportunity_confirmMessage_${opportunityId}` }],
                [{ text: "⬅️ Back to Manage Withrawals", callback_data: "admin_earn" }]
            ]
        }
    };

    bot.sendMessage(chatId, "Select the field you want to edit. Current values are shown in parentheses:", options);
}



// Function to prompt the admin for the new value of the selected field
async function promptForNewValue(chatId, opportunityId, field) {
    const fieldDisplayNames = {
        name: "Name",
        description: "Description",
        address: "Address",
        qrCodeLink: "QR Code Link",
        currency: "Currency",
        minDeposit: "Minimum Deposit",
        minWithdrawal: "Minimum Withdrawal",
        processingTime: "Processing Time",
        confirmMessage: "Confirmation Message"
    };

    bot.sendMessage(chatId, `Please enter the new value for ${fieldDisplayNames[field]}:`);

    bot.on('message', async function handler(msg) {
        if (msg.chat.id !== chatId) return; // Ensure we're only processing the correct user's input

        const newValue = msg.text;
        bot.removeListener('message', handler); // Remove listener after receiving input

        await updateEarningOpportunityField(chatId, opportunityId, field, newValue);
    });
}

// Function to update a specific field of an earning opportunity
async function updateEarningOpportunityField(chatId, opportunityId, field, newValue) {
    try {
        // Prepare the update object dynamically
        const update = {};
        update[field] = field === 'minDeposit' || field === 'minWithdrawal' ? parseFloat(newValue) : newValue;

        // Update the specified field in the database
        const result = await EarningOpportunity.findByIdAndUpdate(opportunityId, update, { new: true });

        if (result) {
            await bot.sendMessage(chatId, `✅ ${field.charAt(0).toUpperCase() + field.slice(1)} has been updated successfully.`);
        } else {
            await bot.sendMessage(chatId, "⚠️ Earning opportunity not found or update failed.");
        }
    } catch (error) {
        console.error("Error updating earning opportunity:", error);
        await bot.sendMessage(chatId, "⚠️ Unable to update the earning opportunity. Please try again.");
    }

    // Show the Manage Withdrawals menu again after editing
    await showManageWithdrawalsMenu(chatId);
}

// Function to prompt the admin to delete an earning opportunity
async function promptDeleteEarningOpportunity(chatId) {
    try {
        // Fetch all earning opportunities
        const opportunities = await EarningOpportunity.find({});

        // Check if there are any opportunities
        if (opportunities.length === 0) {
            bot.sendMessage(chatId, "⚠️ No earning opportunities found.");
            return;
        }

        // Construct a list of opportunities as inline keyboard buttons
        let message = "Select an earning opportunity to delete:";
        const inlineKeyboard = opportunities.map(opportunity => [
            { text: opportunity.name, callback_data: `delete_opportunity_${opportunity._id}` }
        ]);

        const options = {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: inlineKeyboard }
        };

        bot.sendMessage(chatId, message, options);
    } catch (error) {
        console.error("Error fetching earning opportunities:", error);
        bot.sendMessage(chatId, "⚠️ Unable to fetch earning opportunities. Please try again later.");
    }
}

// Function to delete an earning opportunity by ID
async function deleteEarningOpportunity(chatId, opportunityId) {
    try {
        // Find and delete the selected opportunity
        const result = await EarningOpportunity.findByIdAndDelete(opportunityId);

        if (result) {
            await bot.sendMessage(chatId, `✅ Earning opportunity "${result.name}" has been deleted successfully.`);
        } else {
            await bot.sendMessage(chatId, "⚠️ Earning opportunity not found or already deleted.");
        }
    } catch (error) {
        console.error("Error deleting earning opportunity:", error);
        await bot.sendMessage(chatId, "⚠️ Unable to delete the earning opportunity. Please try again.");
    }

    // Show the Manage Withdrawals menu again after deletion
    await showManageWithdrawalsMenu(chatId);
}

// Function to prompt admin to add a new earning opportunity with a step-by-step approach
async function promptAddEarningOpportunity(chatId) {
    bot.sendMessage(
        chatId,
        "Let's add a new earning opportunity! 😊 Please follow the steps to provide details.\n" +
        "Reply with each detail as prompted, and you can type 'cancel' at any time to stop."
    );

    const opportunityData = {};

    // Ask for each field one at a time
    const askForField = async (field, promptMessage) => {
        await bot.sendMessage(chatId, promptMessage);

        return new Promise((resolve) => {
            bot.on('message', function handler(msg) {
                if (msg.chat.id !== chatId) return; // Make sure it's the correct user
                if (msg.text.toLowerCase() === 'cancel') {
                    bot.sendMessage(chatId, "Operation cancelled. 😊");
                    bot.removeListener('message', handler); // Remove listener to prevent future triggers
                    resolve(null); // Exit the prompt
                } else {
                    opportunityData[field] = msg.text;
                    bot.removeListener('message', handler);
                    resolve(msg.text);
                }
            });
        });
    };

    // Step-by-step prompts for each field
    const fields = [
        { field: 'name', prompt: "What's the name of this earning opportunity?" },
        { field: 'description', prompt: "Provide a brief description of this opportunity." },
        { field: 'address', prompt: "Enter the address where funds should be sent." },
        { field: 'qrCodeLink', prompt: "Provide a link to the QR code image (optional). You can skip this by typing 'skip'." },
        { field: 'currency', prompt: "What currency will be used (e.g., BTC, ETH)?" },
        { field: 'minDeposit', prompt: "What's the minimum deposit amount?" },
        { field: 'minWithdrawal', prompt: "What's the minimum withdrawal amount?" },
        { field: 'processingTime', prompt: "How long does it take to process (e.g., '1 week')?" },
        { field: 'confirmMessage', prompt: "Enter a custom confirmation message, or leave blank for default." }
    ];

    for (const { field, prompt } of fields) {
        const response = await askForField(field, prompt);
        if (response === null) return; // If operation is cancelled, exit the function
        if (response.toLowerCase() === 'skip' && field === 'qrCodeLink') {
            opportunityData[field] = ''; // Optional field for QR code
        }
    }

    // Confirm and save the new opportunity
    await addEarningOpportunity(chatId, opportunityData);
    // Send admin back to the "Manage Withdrawals" menu
    showManageWithdrawalsMenu(chatId)
}

// Function to add a new earning opportunity to the database
async function addEarningOpportunity(chatId, data) {
    try {
        const newOpportunity = new EarningOpportunity({
            name: data.name,
            description: data.description,
            address: data.address,
            qrCodeLink: data.qrCodeLink || '', // Optional field
            currency: data.currency,
            minDeposit: parseFloat(data.minDeposit),
            minWithdrawal: parseFloat(data.minWithdrawal),
            processingTime: data.processingTime,
            confirmMessage: data.confirmMessage || "Your request has been submitted and will be processed soon."
        });

        await newOpportunity.save();
        bot.sendMessage(chatId, `🎉 Success! The earning opportunity "${data.name}" has been added.`);
    } catch (error) {
        console.error("Error adding earning opportunity:", error);
        bot.sendMessage(chatId, "⚠️ Unable to add the new earning opportunity. Please try again.");
    }
}



// Function to show the Manage Withdrawals menu to the admin
async function showManageWithdrawalsMenu(chatId) {
    const options = {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "➕ Add Earning Opportunity", callback_data: "add_earning_opportunity" }],
                [{ text: "❌ Delete Earning Opportunity", callback_data: "delete_earning_opportunity" }],
                [{ text: "✏️ Edit Earning Opportunity", callback_data: "edit_earning_opportunity" }],
                [{ text: "⬅️ Back to Main Menu", callback_data: "main_menu" }]
            ]
        }
    };

    bot.sendMessage(chatId, "🔧 *Manage Withdrawals*\n\nChoose an option:", options);
}


// Updated function to handle deposit with memo as userId
async function handleDeposit(chatId, opportunityId) {
    try {
        const opportunity = await EarningOpportunity.findById(opportunityId);

        // Check if the opportunity exists
        if (!opportunity) {
            bot.sendMessage(chatId, "⚠️ Earning opportunity not found. Please try again.");
            return;
        }

        // Message with deposit address and memo (user ID)
        const depositMessage = `
        💸 *Deposit to ${opportunity.name}*

        Send your deposit to the address below:
        - Address: \`${opportunity.address}\`
        - Memo: \`${chatId}\` (Use this memo for identification)

        Once you've sent the amount, please confirm by clicking "Confirm Deposit".
        `;

        const options = {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Confirm Deposit", callback_data: `confirm_deposit_${opportunityId}` }],
                    [{ text: "Back to Earn Section", callback_data: "earn" }]
                ]
            }
        };

        // Send deposit details and confirm button to the user
        bot.sendMessage(chatId, depositMessage, options);

    } catch (error) {
        console.error("Error handling deposit:", error);
        bot.sendMessage(chatId, "⚠️ Unable to proceed with deposit. Please try again later.");
    }
}


// Updated function to handle withdrawal with a request initiation
async function handleWithdrawal(chatId, opportunityId) {
    try {
        const opportunity = await EarningOpportunity.findById(opportunityId);
        const user = await User.findOne({ userId: chatId });

        if (!opportunity) {
            bot.sendMessage(chatId, "⚠️ Earning opportunity not found. Please try again.");
            return;
        }

        if (!user) {
            bot.sendMessage(chatId, "⚠️ User not found. Please try again.");
            return;
        }

        // Display the withdrawal details
        const withdrawalMessage = `
        💸 *Request Withdrawal for ${opportunity.name}*

        Minimum withdrawal amount is ${opportunity.minWithdrawal} ${opportunity.currency}.
        Withdrawals are processed manually on a weekly basis.

        Click "Confirm Withdrawal" to proceed.
        `;

        const options = {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Confirm Withdrawal", callback_data: `confirm_withdrawal_${opportunityId}` }],
                    [{ text: "Back to Earn Section", callback_data: "earn" }]
                ]
            }
        };

        bot.sendMessage(chatId, withdrawalMessage, options);
    } catch (error) {
        console.error("Error handling withdrawal:", error);
        bot.sendMessage(chatId, "⚠️ Unable to proceed with withdrawal. Please try again later.");
    }
}

async function confirmWithdrawal(chatId, opportunityId) {
    try {
        // Retrieve user and opportunity details
        const user = await User.findOne({ userId: chatId });
        const opportunity = await EarningOpportunity.findById(opportunityId);

        if (!user) {
            bot.sendMessage(chatId, "⚠️ User not found.");
            return;
        }
        if (!opportunity) {
            bot.sendMessage(chatId, "⚠️ Earning opportunity not found. Please try again.");
            return;
        }

        // Retrieve currency and minimum withdrawal amount from the opportunity
        const currency = opportunity.currency;
        const amount = opportunity.minWithdrawal;

        // Access balance for the specified currency using Map's .get() method
        const currentBalance = user.cryptoBalances.get(currency) || 0;

        // Check if the user has enough balance to withdraw
        if (currentBalance < amount) {
            bot.sendMessage(chatId, `⚠️ Insufficient ${currency} balance for this withdrawal request.`);
            return;
        }

        // Deduct the withdrawal amount immediately from user's cryptoBalances
        user.cryptoBalances.set(currency, currentBalance - amount);
        await user.save();

        // Create a new pending withdrawal transaction
        const transaction = new Transaction({
            userId: user._id,
            type: 'withdrawal',
            currency,
            amount,
            status: 'pending', // To be processed in the weekly batch
        });

        await transaction.save();

        bot.sendMessage(chatId, `✅ Your withdrawal request of ${amount} ${currency} has been submitted. Processing will occur within the week.`);
    } catch (error) {
        console.error("Error confirming withdrawal:", error);
        bot.sendMessage(chatId, "⚠️ Unable to confirm withdrawal. Please try again later.");
    }
}

// Confirmation function to handle both deposit and withdrawal confirmation
async function confirmDeposit(chatId, opportunityId) {
    try {
        // Retrieve user and opportunity details
        const user = await User.findOne({ userId: chatId });
        const opportunity = await EarningOpportunity.findById(opportunityId);

        if (!user) {
            bot.sendMessage(chatId, "⚠️ User not found.");
            return;
        }
        if (!opportunity) {
            bot.sendMessage(chatId, "⚠️ Earning opportunity not found. Please try again.");
            return;
        }

        // Retrieve currency and minimum deposit amount from the opportunity
        const currency = opportunity.currency;
        const amount = opportunity.minDeposit;

        // Create a new pending deposit transaction
        const transaction = new Transaction({
            userId: user._id,
            type: 'deposit',
            currency,
            amount,
            status: 'pending', // Waiting for admin verification
            memo: user.userId // Using user ID as memo for easy tracking
        });

        await transaction.save();

        bot.sendMessage(chatId, `✅ Your deposit request of ${amount} ${currency} has been confirmed. An admin will verify it shortly.`);
    } catch (error) {
        console.error("Error confirming deposit:", error);
        bot.sendMessage(chatId, "⚠️ Unable to confirm deposit. Please try again later.");
    }
}






async function showEarnOpportunities(chatId) {
    try {
        // Fetch all earning opportunities from the database
        const opportunities = await EarningOpportunity.find({});

        // Build the message with each opportunity's details
        let earnMessage = `💰 *Earning Opportunities*\n\nSelect an option to deposit or withdraw:\n\n`;
        const options = {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: []
            }
        };

        // Add each opportunity's details to the message
        opportunities.forEach((opportunity) => {
            earnMessage += `🔹 *${opportunity.name}*\n${opportunity.description}\n\n`;
            options.reply_markup.inline_keyboard.push(
                [
                    { text: `Deposit to ${opportunity.name}`, callback_data: `deposit_${opportunity._id}` },
                    { text: `Withdraw from ${opportunity.name}`, callback_data: `withdraw_${opportunity._id}` }
                ]
            );
        });

        // Add a button to return to the main menu
        options.reply_markup.inline_keyboard.push([{ text: "Back to Main Menu", callback_data: "main_menu" }]);

        // Send the message
        bot.sendMessage(chatId, earnMessage, options);
    } catch (error) {
        console.error("Error fetching earning opportunities:", error);
        bot.sendMessage(chatId, "⚠️ Unable to fetch earning opportunities. Please try again later.");
    }
}

async function addNewTask(chatId) {
    bot.sendMessage(chatId, "Enter the task *name*:", { parse_mode: "Markdown" });

    bot.once("message", async (msg) => {
        const taskName = msg.text;
        bot.sendMessage(chatId, "Enter the task *description*:", { parse_mode: "Markdown" });

        bot.once("message", async (msg) => {
            const taskDescription = msg.text;
            bot.sendMessage(chatId, "Enter the *channel ID* (e.g., @testVectoroad):", { parse_mode: "Markdown" });

            bot.once("message", async (msg) => {
                const channelId = msg.text;
                bot.sendMessage(chatId, "Enter the *points* for this task:", { parse_mode: "Markdown" });

                bot.once("message", async (msg) => {
                    const points = parseInt(msg.text, 10);

                    const newTask = new Task({
                        name: taskName,
                        description: taskDescription,
                        channelId: channelId,
                        points: points,
                        verifiedUsers: []
                    });

                    await newTask.save();
                    bot.sendMessage(chatId, `✅ Task "${taskName}" added successfully!`);
                    showManageTasks(chatId);
                });
            });
        });
    });
}


async function showEditTaskMenu(chatId) {
    const tasks = await Task.find({});
    const taskButtons = tasks.map(task => ([{ text: task.name, callback_data: `edit_task_${task._id}` }]));

    const options = {
        reply_markup: {
            inline_keyboard: [...taskButtons, [{ text: "Back to Task Management", callback_data: "admin_manage_tasks" }]]
        }
    };

    bot.sendMessage(chatId, "Select a task to edit:", options);
}

// Edit selected task fields
async function editTask(chatId, taskId) {
    const task = await Task.findById(taskId);
    bot.sendMessage(chatId, `Editing task: *${task.name}*\nWhat would you like to edit?`, {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "Edit Name", callback_data: `edit_task_name_${taskId}` }],
                [{ text: "Edit Description", callback_data: `edit_task_description_${taskId}` }],
                [{ text: "Edit Channel ID", callback_data: `edit_task_channel_${taskId}` }],
                [{ text: "Edit Points", callback_data: `edit_task_points_${taskId}` }],
                [{ text: "Back to Task Management", callback_data: "admin_manage_tasks" }]
            ]
        }
    });
}


async function deleteTask(chatId) {
    const tasks = await Task.find({});
    const taskButtons = tasks.map(task => ([{ text: task.name, callback_data: `delete_task_${task._id}` }]));

    const options = {
        reply_markup: {
            inline_keyboard: [...taskButtons, [{ text: "Back to Task Management", callback_data: "admin_manage_tasks" }]]
        }
    };

    bot.sendMessage(chatId, "Select a task to delete:", options);
}

// Confirm and delete task
async function confirmDeleteTask(chatId, taskId) {
    const task = await Task.findByIdAndDelete(taskId);
    bot.sendMessage(chatId, `🚮 Task "${task.name}" has been deleted.`);
    showManageTasks(chatId);
}



function showManageTasks(chatId) {
    const message = `
    📋 *Task Management*
    
    Select an option to manage tasks:
    `;

    const options = {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "Add New Task", callback_data: "admin_add_task" }],
                [{ text: "Edit Existing Task", callback_data: "admin_edit_task" }],
                [{ text: "Delete Task", callback_data: "admin_delete_task" }],
                [{ text: "Back to Admin Menu", callback_data: "admin_dashboard" }]
            ]
        }
    };

    bot.sendMessage(chatId, message, options);
}


async function updateSetting(key, field, value) {
    try {
        // Directly update the specific field within "value"
        await Settings.updateOne(
            { key },
            { $set: { [`value.${field}`]: value } },
            { upsert: true } // Ensures the document is created if it doesn't exist
        );

        console.log(`Field ${field} in ${key} updated successfully.`);
    } catch (error) {
        console.error(`Error updating field ${field} in setting ${key}:`, error);
    }
}







function handleEditAdDescription(chatId) {
    bot.sendMessage(chatId, "Please enter the new *Ad Description*:", { parse_mode: "Markdown" });

    // Listen for the next message to get the new description
    bot.once("message", async (msg) => {
        const newDescription = msg.text;

        // Update the ad description in the database
        await updateSetting("homePageSettings", "adDescription", newDescription);
        bot.sendMessage(chatId, "✅ Ad Description updated successfully.");
    });
}

function handleEditAdLink(chatId) {
    bot.sendMessage(chatId, "Please enter the new *Ad Channel Link*:", { parse_mode: "Markdown" });

    // Listen for the next message to get the new link
    bot.once("message", async (msg) => {
        const newLink = msg.text;

        // Update the ad link in the database
        await updateSetting("homePageSettings", "adChannelLink", newLink);
        bot.sendMessage(chatId, "✅ Ad Channel Link updated successfully.");
    });
}

function handleEditMainLogo(chatId) {
    bot.sendMessage(chatId, "Please enter the new *Main logo link*:", { parse_mode: "Markdown" });
    bot.once("message", async (msg) => {
        const newLink = msg.text;

        // Update the ad link in the database
        const result = await Settings.updateOne(
            { key: "MainMenuImage" },
            { value: newLink }
        );
        if (result.modifiedCount > 0) {
            console.log("Update successful:", result);
        } else {
            console.log("No document was modified. Check if the key exists.");
        }
        bot.sendMessage(chatId, "✅ Main logo Link updated successfully.");
    });
    return
}


function showManageHome(chatId) {
    const manageHomeMessage = `
    🏠 *Manage Home Page*

    Here you can edit the home page settings. Select an option to update:
    `;

    const options = {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "Edit Ad Title", callback_data: "admin_edit_ad_title" }],
                [{ text: "Edit Ad Description", callback_data: "admin_edit_ad_description" }],
                [{ text: "Edit Ad Link", callback_data: "admin_edit_ad_link" }],
                [{ text: "Edit Main logo", callback_data: "admin_edit_main_logo" }],
                [{ text: "Back to Admin Menu", callback_data: "admin_dashboard" }]
            ]
        }
    };

    bot.sendMessage(chatId, manageHomeMessage, options);
}


// Function to display user statistics for Admin
async function showUserStats(chatId) {
    try {
        // Retrieve all users from the database
        const users = await User.find({}, 'userId username firstName balance');

        // If there are no users, inform the admin
        if (users.length === 0) {
            bot.sendMessage(chatId, "📊 No users found in the database.");
            return;
        }

        // Construct the message
        let statsMessage = `📊 *User Statistics*\n\nTotal Users: ${users.length}\n\n`;

        users.forEach(user => {
            const userId = user.userId; // No escaping needed for userId if it’s purely numeric
            const username = user.username ? escapeMarkdown(user.username) : 'N/A'; // Escape username only if it may have special characters
            const firstName = user.firstName ? escapeMarkdown(user.firstName) : 'N/A'; // Escape firstName only if it may have special characters
            const balance = user.balance || 0;

            statsMessage += `👤 *User ID*: ${userId}\n`;
            statsMessage += `📛 *Username*: ${username}\n`;
            statsMessage += `📝 *First Name*: ${firstName}\n`;
            statsMessage += `💰 *Balance*: ${balance} points\n\n`;
        });

        // Send the message to the admin in chunks if too long
        const messageChunks = chunkMessage(statsMessage, 4096); // Telegram message limit
        messageChunks.forEach(chunk => bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' }));

    } catch (error) {
        console.error("Error retrieving user stats:", error);
        bot.sendMessage(chatId, "⚠️ Unable to retrieve user statistics. Please try again later.");
    }
}

// Helper function to chunk message if it exceeds Telegram's character limit
function chunkMessage(message, maxLength) {
    const chunks = [];
    while (message.length > maxLength) {
        let chunk = message.slice(0, maxLength);
        const lastNewline = chunk.lastIndexOf('\n');
        if (lastNewline > 0) chunk = chunk.slice(0, lastNewline);
        chunks.push(chunk);
        message = message.slice(chunk.length);
    }
    chunks.push(message);
    return chunks;
}

// Helper function to escape Markdown special characters
function escapeMarkdown(text) {
    return text.replace(/([_*[\]()~`>#+-=|{}.!])/g, '\\$1');
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
        const referPoints = await Settings.findOne({ key: "referral_points" });

        // Generate the referral link without wrapping in backticks
        const referralLink = `https://t.me/${process.env.BOT_USERNAME}?start=referral_${chatId}`;

        // Retrieve all referrals for this user from the Referral collection
        const referrals = await Referral.find({ referrerId: chatId });
        const referralsCount = referrals ? referrals.length : 0;

        // Generate list of referred users
        let referredUsersList = "";
        if (referralsCount > 0) {
            referredUsersList += "*Users You Invited:*\n";
            for (const [index, referral] of referrals.entries()) {
                const referredUser = await User.findOne({ userId: referral.referredUserId });
                const displayName = referredUser
                    ? referredUser.username || referredUser.firstName || "Unknown User"
                    : "Unknown User";
                referredUsersList += `   ${index + 1}. ${displayName}\n`;
            }
        } else {
            referredUsersList = "_No referrals yet._";
        }

        // Construct the referral message with improved formatting
        const referMessage = `
📢 *Refer and Earn*

Invite your friends to join and earn *${referPoints?.value || 0} points* for each successful referral! Share your unique link below:

🔗 *Your Referral Link:*
${referralLink}

👥 *Total Referrals:* ${referralsCount}

${referredUsersList}
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
async function showMainMenu(chatId) {
    const menuMessage = `
    🎉 Main Menu
    Select an option below:
    `;
    const adSetting = await Settings.findOne({ key: 'MainMenuImage' });

    const options = {

    };
    bot.sendPhoto(chatId, adSetting.value, {
        caption: menuMessage,
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "Home", callback_data: "home" }],
                [{ text: "Tasks", callback_data: "tasks" }],
                [{ text: "Refer and Earn", callback_data: "refer" }],
                [{ text: "Withdrawal", callback_data: "withdrawal" }],
                [{ text: "Earn", callback_data: "earn" }]
            ]
        }
    });

    // bot.sendMessage(chatId, menuMessage, options);
}

// Individual section functions with Back to Main Menu button
async function showHome(chatId) {
    try {
        // Retrieve user data from MongoDB
        const user = await User.findOne({ userId: chatId });
        const balance = user ? user.balance : 0; // Default to 0 if user not found
        const adSetting = await Settings.findOne({ key: 'homePageSettings' });

        // Check if there are any crypto balances to display
        let cryptoBalanceMessage = '';
        if (user && user.cryptoBalances && user.cryptoBalances.size > 0) {
            cryptoBalanceMessage = '\n\n💰 *Your Crypto Balances:*\n';
            for (let [currency, amount] of user.cryptoBalances.entries()) {
                cryptoBalanceMessage += `- ${currency}: ${amount}\n`;
            }
        }

        // Home page message with user's regular balance and crypto balances if available
        const homeMessage = `
        🏠 *Home Page*
        
        💰 *Your Current Balance:* ${balance} points
        ${cryptoBalanceMessage}
        
        📢 *${adSetting?.value?.adTitle || ""}* ${adSetting?.value?.adDescription || ""}
        `;

        const options = {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: `${adSetting?.value?.adButton || "Learn More"}`, url: `${adSetting?.value?.adChannelLink || "#"}` }],
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


// SHow tasks fn
async function showTasks(chatId) {
    try {
        // Fetch tasks from MongoDB
        const tasks = await Task.find({});

        // Build the tasks message dynamically
        let tasksMessage = `📋 *Tasks*\n\nJoin the following channels and click "Claim" to verify and earn points:\n\n`;

        // Generate task buttons and messages dynamically from the database
        const taskButtons = tasks.map(task => [
            { text: `Claim ${task.name}`, callback_data: `claim_${task._id}` }
        ]);

        tasks.forEach(task => {
            // Generate the Telegram join link using the channel ID or username
            // Remove the '@' symbol if present in `channelId`
            const cleanChannelId = task.channelId.replace('@', '');
            const channelLink = `https://t.me/${cleanChannelId}`;

            tasksMessage += `🔹 *${task.name}*\n(${task.description})\n📎 [Join Channel](${channelLink})\n\n`;
        });

        tasksMessage += "After joining the channel, click the corresponding 'Claim' button below to verify and claim your points.";

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


