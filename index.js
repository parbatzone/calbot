
// California Highway Patrol Discord Bot
// Required dependencies
const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, 
    SlashCommandBuilder, REST, Routes, ApplicationCommandType,
    ApplicationCommandOptionType } = require('discord.js');
  const fs = require('fs');
  const path = require('path');
  
  // Initialize client with necessary intents
  const client = new Client({ 
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ] 
  });
  
  // Bot configuration
  const config = {
    token: 'MTM3MTM4OTgyOTIxNTk0NDc0NA.G_Bsz9.9sBl6a8dXInuG5uRvG544gHvmbvt4LHJLf4_EA', // Replace with your bot token
    clientId: '1371389829215944744', // Replace with your application ID
    supportServer: 'YOUR_SUPPORT_SERVER_INVITE', // Support server invite link
  };
  
  // Database simulation (would use a real database in production)
  let arrestLogs = [];
  let botSettings = {};
  
  // Create required directories
  const DATA_DIR = path.join(__dirname, 'data');
  const MUGSHOTS_DIR = path.join(DATA_DIR, 'mugshots');
  
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }
  if (!fs.existsSync(MUGSHOTS_DIR)) {
    fs.mkdirSync(MUGSHOTS_DIR);
  }
  
  // Load data if exists
  const ARREST_DATA_PATH = path.join(DATA_DIR, 'arrests.json');
  const SETTINGS_DATA_PATH = path.join(DATA_DIR, 'settings.json');
  
  function loadData() {
    try {
      if (fs.existsSync(ARREST_DATA_PATH)) {
        arrestLogs = JSON.parse(fs.readFileSync(ARREST_DATA_PATH, 'utf8'));
      }
      if (fs.existsSync(SETTINGS_DATA_PATH)) {
        botSettings = JSON.parse(fs.readFileSync(SETTINGS_DATA_PATH, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }
  
  function saveData() {
    try {
      fs.writeFileSync(ARREST_DATA_PATH, JSON.stringify(arrestLogs, null, 2));
      fs.writeFileSync(SETTINGS_DATA_PATH, JSON.stringify(botSettings, null, 2));
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }
  
  // Define slash commands
  const commands = [
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Setup the CHP Bot')
      .addChannelOption(option => 
        option.setName('arrest_channel')
          .setDescription('Channel to log arrests')
          .setRequired(true)),
    
    new SlashCommandBuilder()
      .setName('log-arrest')
      .setDescription('Log a new arrest')
      .addStringOption(option => 
        option.setName('suspect_name')
          .setDescription('Name of the suspect')
          .setRequired(true))
      .addStringOption(option => 
        option.setName('charges')
          .setDescription('Charges against the suspect')
          .setRequired(true))
      .addStringOption(option => 
        option.setName('location')
          .setDescription('Location of arrest')
          .setRequired(true))
      .addStringOption(option => 
        option.setName('details')
          .setDescription('Additional arrest details')
          .setRequired(false))
      .addAttachmentOption(option => 
        option.setName('mugshot')
          .setDescription('Mugshot of the suspect')
          .setRequired(false)),
    
    new SlashCommandBuilder()
      .setName('search-arrest')
      .setDescription('Search for an arrest record')
      .addStringOption(option => 
        option.setName('suspect_name')
          .setDescription('Name of the suspect to search for')
          .setRequired(true)),
          
    new SlashCommandBuilder()
      .setName('support')
      .setDescription('Get support for the CHP Bot')
  ];
  
  // Register commands
  const rest = new REST({ version: '10' }).setToken(config.token);
  
  async function registerCommands() {
    try {
      console.log('Started refreshing application (/) commands.');
      
      // Register global commands
      await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commands },
      );
      
      console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
      console.error(error);
    }
  }
  
  // Get the command IDs for verification
  async function getCommandIds() {
    try {
      const registeredCommands = await rest.get(
        Routes.applicationCommands(config.clientId)
      );
      
      console.log('Registered commands:');
      registeredCommands.forEach(cmd => {
        console.log(`${cmd.name}: ${cmd.id}`);
      });
    } catch (error) {
      console.error('Error fetching commands:', error);
    }
  }
  
  // Event handlers
  client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('California Highway Patrol Bot is now online!');
    
    // Set bot status with support command badge
    client.user.setPresence({
      activities: [{
        name: '“Drive Safe. Serve Proud. CHP Strong.”',
        type: 4, // Custom Status
      }],
      status: 'offline'
    });
    
    loadData();
    await registerCommands();
    await getCommandIds();
  });
  
  client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    
    const { commandName } = interaction;
    
    // Delete the command message if it's in a text channel
    try {
      if (interaction.channel && interaction.channel.type !== 1) { // 1 is DM
        const fetchedMessages = await interaction.channel.messages.fetch({ limit: 10 });
        const userMessage = fetchedMessages.find(msg => 
          msg.interaction && msg.interaction.id === interaction.id
        );
        
        if (userMessage) {
          await userMessage.delete().catch(err => console.error('Error deleting message:', err));
        }
      }
    } catch (error) {
      console.error('Error handling message deletion:', error);
    }
    
    if (commandName === 'setup') {
      const arrestChannel = interaction.options.getChannel('arrest_channel');
      
      botSettings[interaction.guildId] = {
        arrestChannelId: arrestChannel.id
      };
      
      saveData();
      
      const setupEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('CHP Bot Setup Complete')
        .setDescription(`Arrest logs will be sent to ${arrestChannel}`)
        .setTimestamp()
        .setFooter({ text: 'California Highway Patrol Bot' });
      
      await interaction.reply({ embeds: [setupEmbed], ephemeral: true });
    }
    
    else if (commandName === 'log-arrest') {
      // Check if setup has been completed
      if (!botSettings[interaction.guildId] || !botSettings[interaction.guildId].arrestChannelId) {
        return interaction.reply({ 
          content: 'Bot is not set up. Please use `/setup` first.', 
          ephemeral: true 
        });
      }
      
      const suspectName = interaction.options.getString('suspect_name');
      const charges = interaction.options.getString('charges');
      const location = interaction.options.getString('location');
      const details = interaction.options.getString('details') || 'None provided';
      const mugshot = interaction.options.getAttachment('mugshot');
      
      // Generate arrest ID
      const arrestId = `CHP-${Date.now().toString().slice(-6)}`;
      
      // Create arrest record
      const arrestRecord = {
        id: arrestId,
        suspectName,
        charges,
        location,
        details,
        arrestDate: new Date().toISOString(),
        officerId: interaction.user.id,
        officerName: interaction.user.username,
        hasMugshot: !!mugshot
      };
      
      // Save mugshot if provided
      let mugshotPath = null;
      if (mugshot) {
        // Check if it's an image
        if (!mugshot.contentType.startsWith('image/')) {
          return interaction.reply({ 
            content: 'Mugshot must be an image file.', 
            ephemeral: true 
          });
        }
        
        mugshotPath = path.join(MUGSHOTS_DIR, `${arrestId}.png`);
        
        try {
          // Fetch the image and save it
          const response = await fetch(mugshot.url);
          const buffer = Buffer.from(await response.arrayBuffer());
          fs.writeFileSync(mugshotPath, buffer);
          arrestRecord.mugshotPath = mugshotPath;
        } catch (error) {
          console.error('Error saving mugshot:', error);
          return interaction.reply({ 
            content: 'Failed to save mugshot. Please try again.', 
            ephemeral: true 
          });
        }
      }
      
      // Store the arrest record
      arrestLogs.push(arrestRecord);
      saveData();
      
      // Create embed for arrest log
      const arrestEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(`Arrest Record: ${arrestId}`)
        .addFields(
          { name: 'Suspect', value: suspectName, inline: true },
          { name: 'Charges', value: charges, inline: true },
          { name: 'Location', value: location, inline: true },
          { name: 'Arresting Officer', value: interaction.user.username, inline: true },
          { name: 'Date & Time', value: new Date().toLocaleString(), inline: true },
          { name: 'Details', value: details }
        )
        .setTimestamp()
        .setFooter({ text: 'California Highway Patrol' });
      
      // Add mugshot to embed if provided
      if (mugshot) {
        arrestEmbed.setImage(mugshot.url);
      }
      
      // Get the arrest log channel
      const arrestChannel = await client.channels.fetch(botSettings[interaction.guildId].arrestChannelId);
      
      // Send arrest log to channel
      await arrestChannel.send({ embeds: [arrestEmbed] });
      
      // Confirm to the officer
      await interaction.reply({ 
        content: `Arrest record ${arrestId} has been logged successfully.`, 
        ephemeral: true 
      });
    }
    
    else if (commandName === 'search-arrest') {
      const suspectName = interaction.options.getString('suspect_name');
      
      // Search for matches (case insensitive)
      const matches = arrestLogs.filter(record => 
        record.suspectName.toLowerCase().includes(suspectName.toLowerCase())
      );
      
      if (matches.length === 0) {
        return interaction.reply({
          content: `No arrest records found for suspect: ${suspectName}`,
          ephemeral: true
        });
      }
      
      // Create embed for search results
      const searchEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`Search Results: ${suspectName}`)
        .setDescription(`Found ${matches.length} record(s)`)
        .setTimestamp()
        .setFooter({ text: 'California Highway Patrol Bot' });
      
      // Add first 10 records to embed
      matches.slice(0, 10).forEach((record, index) => {
        searchEmbed.addFields({
          name: `Record #${index + 1}: ${record.id}`,
          value: `**Suspect:** ${record.suspectName}\n**Charges:** ${record.charges}\n**Location:** ${record.location}\n**Officer:** ${record.officerName}\n**Date:** ${new Date(record.arrestDate).toLocaleString()}`
        });
      });
      
      // If there are more than 10 records, add a note
      if (matches.length > 10) {
        searchEmbed.addFields({
          name: 'Note',
          value: `${matches.length - 10} additional records were found but not displayed. Please refine your search.`
        });
      }
      
      await interaction.reply({ embeds: [searchEmbed], ephemeral: false });
    }
    
    else if (commandName === 'support') {
      // Create support embed
      const supportEmbed = new EmbedBuilder()
        .setColor(0x2F3136)
        .setTitle('California Highway Patrol Bot Support')
        .setDescription('Need help with the CHP Bot? Join our support server for assistance.')
        .addFields(
          { name: 'Support Server', value: `[Click to join](${config.supportServer})`, inline: true },
          { name: 'Commands', value: '`/setup` - Configure the bot\n`/log-arrest` - Log a new arrest\n`/search-arrest` - Find arrest records', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'CHP Discord Bot • Available 24/7' });
        
      // Create support button
      const supportButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setLabel('Join Support Server')
            .setStyle(ButtonStyle.Link)
            .setURL(config.supportServer)
        );
        
      await interaction.reply({ 
        embeds: [supportEmbed],
        components: [supportButton],
        ephemeral: true 
      });
    }
  });
  
  // Error handling
  client.on('error', console.error);
  process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
  });
  
  // Bot login
  client.login(config.token);
  
  // Export for potential use in other files
  module.exports = { client };
  //eyJhbGciOiJIUzI1NiJ9.eyJpZCI6Ijc3MTYxOTQyMTA3OTczMjIzNCIsImtleSI6ImM2NmIwYzI1ZDg1MDRkZTFlNjEzNjgyMWJlYTgifQ.ix4oK2GbPm6869MN6icWSc1S7O2aNFxVrorHPNeIOCY