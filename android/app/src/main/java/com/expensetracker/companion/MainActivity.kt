package com.expensetracker.companion

import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import com.expensetracker.companion.data.local.ExpenseDatabase
import com.expensetracker.companion.data.local.TransactionEntity
import com.expensetracker.companion.service.UpiNotificationListenerService
import com.expensetracker.companion.sync.SyncPreferences
import com.expensetracker.companion.sync.SyncWorker
import com.expensetracker.companion.util.NotificationDebugLog
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.*

class MainActivity : ComponentActivity() {

    private val isPermissionGrantedState = mutableStateOf(false)
    private var initialTabState = mutableIntStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        initialTabState.intValue = intent?.getIntExtra("OPEN_TAB", 0) ?: 0

        // Schedule periodic background sync
        SyncWorker.schedulePeriodic(this)

        checkPermission()

        setContent {
            ExpenseTrackerApp(
                isPermissionGranted = isPermissionGrantedState.value,
                onRefreshPermission = { checkPermission() },
                initialTab = initialTabState.intValue
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        initialTabState.intValue = intent.getIntExtra("OPEN_TAB", 0)
    }

    override fun onResume() {
        super.onResume()
        checkPermission()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isPermissionGrantedState.value) {
                NotificationListenerService.requestRebind(
                    ComponentName(this, UpiNotificationListenerService::class.java)
                )
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "Failed to rebind service: ${e.message}")
        }
    }

    private fun checkPermission() {
        isPermissionGrantedState.value = isNotificationAccessGranted(this)
    }
}

fun isNotificationAccessGranted(context: android.content.Context): Boolean {
    val pkgName = context.packageName
    val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: ""
    if (flat.isNotEmpty()) {
        val names = flat.split(":")
        for (name in names) {
            val cn = android.content.ComponentName.unflattenFromString(name)
            if (cn != null && cn.packageName == pkgName) {
                return true
            }
        }
    }
    return NotificationManagerCompat.getEnabledListenerPackages(context).contains(pkgName)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExpenseTrackerApp(
    isPermissionGranted: Boolean,
    onRefreshPermission: () -> Unit,
    initialTab: Int = 0
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val db = remember { ExpenseDatabase.getDatabase(context) }
    val dao = db.transactionDao()

    val transactions by dao.getAllTransactions().collectAsState(initial = emptyList())
    val pendingTransactions by dao.getPendingReviewTransactions().collectAsState(initial = emptyList())
    val pendingCount by dao.getPendingReviewCount().collectAsState(initial = 0)

    var selectedTab by remember { mutableIntStateOf(initialTab) }

    val totalIncomePaise = transactions.filter { it.type == "income" && it.reviewStatus == "confirmed" }.sumOf { it.amountPaise }
    val totalExpensePaise = transactions.filter { it.type == "expense" && it.reviewStatus == "confirmed" }.sumOf { it.amountPaise }
    val balancePaise = totalIncomePaise - totalExpensePaise

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Expense Tracker Companion",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                },
                actions = {
                    IconButton(onClick = {
                        SyncWorker.enqueue(context)
                    }) {
                        Icon(Icons.Default.Sync, contentDescription = "Sync Now")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.Dashboard, contentDescription = "Dashboard") },
                    label = { Text("Dashboard") }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = {
                        BadgedBox(badge = {
                            if (pendingCount > 0) {
                                Badge { Text("$pendingCount") }
                            }
                        }) {
                            Icon(Icons.Default.NotificationsActive, contentDescription = "UPI Review")
                        }
                    },
                    label = { Text("Review") }
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
                    label = { Text("Settings") }
                )
            }
        }
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            when (selectedTab) {
                0 -> DashboardScreen(
                    totalIncomePaise = totalIncomePaise,
                    totalExpensePaise = totalExpensePaise,
                    balancePaise = balancePaise,
                    transactions = transactions,
                    isPermissionGranted = isPermissionGranted,
                    onOpenSettings = {
                        context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                    },
                    onRefreshPermission = onRefreshPermission
                )
                1 -> UpiReviewScreen(
                    pendingList = pendingTransactions,
                    onConfirm = { id ->
                        scope.launch { dao.confirmTransaction(id) }
                    },
                    onReject = { id ->
                        scope.launch { dao.rejectTransaction(id) }
                    }
                )
                2 -> SettingsScreen(
                    isPermissionGranted = isPermissionGranted,
                    onGrantPermission = {
                        context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                    },
                    onRefreshPermission = onRefreshPermission,
                    onTriggerTestUpi = { type, amountPaise, party, desc, source ->
                        scope.launch {
                            val testEntity = TransactionEntity(
                                id = UUID.randomUUID().toString(),
                                userId = "default-user",
                                amountPaise = amountPaise,
                                type = type,
                                categoryId = if (type == "expense") "cat-food" else "cat-other-inc",
                                description = desc,
                                partyName = party,
                                paymentMethod = "upi",
                                source = source,
                                externalReference = "UPI" + (100000000000L..999999999999L).random(),
                                reviewStatus = "pending",
                                syncStatus = "pending"
                            )
                            dao.insert(testEntity)
                        }
                    }
                )
            }
        }
    }
}

@Composable
fun DashboardScreen(
    totalIncomePaise: Long,
    totalExpensePaise: Long,
    balancePaise: Long,
    transactions: List<TransactionEntity>,
    isPermissionGranted: Boolean,
    onOpenSettings: () -> Unit,
    onRefreshPermission: () -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (!isPermissionGranted) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Notification Permission Required",
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "Allow notification access to auto-detect PhonePe, Google Pay, and Paytm transactions.\n\nNote for Android 13/14/15: If the toggle is greyed out, open App Info > 3 dots (⋮) > Allow restricted settings.",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = onOpenSettings,
                                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                            ) {
                                Text("Enable Access")
                            }
                            OutlinedButton(onClick = onRefreshPermission) {
                                Text("Refresh Status")
                            }
                        }
                    }
                }
            }
        }

        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text("Net Balance", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        formatPaiseToInr(balancePaise),
                        fontSize = 32.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = if (balancePaise >= 0) Color(0xFF10B981) else Color(0xFFEF4444)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("Income", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(formatPaiseToInr(totalIncomePaise), fontWeight = FontWeight.Bold, color = Color(0xFF10B981))
                        }
                        Column {
                            Text("Expenses", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(formatPaiseToInr(totalExpensePaise), fontWeight = FontWeight.Bold, color = Color(0xFFEF4444))
                        }
                    }
                }
            }
        }

        item {
            Text("Recent Transactions", fontWeight = FontWeight.Bold, fontSize = 18.sp)
        }

        if (transactions.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("No transactions logged yet.", color = Color.Gray)
                }
            }
        } else {
            items(transactions.take(15)) { tx ->
                TransactionRow(tx)
            }
        }
    }
}

@Composable
fun TransactionRow(tx: TransactionEntity) {
    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = if (tx.type == "expense") Icons.Default.ArrowDownward else Icons.Default.ArrowUpward,
                contentDescription = null,
                tint = if (tx.type == "expense") Color(0xFFEF4444) else Color(0xFF10B981)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    tx.partyName ?: if (tx.type == "income") "Received via UPI" else "Payment via UPI",
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp
                )
                if (tx.description.isNotBlank()) {
                    Text(
                        tx.description,
                        fontSize = 11.sp,
                        color = Color.DarkGray,
                        maxLines = 2,
                        lineHeight = 14.sp
                    )
                }
                Spacer(modifier = Modifier.height(2.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(tx.source.uppercase(), fontSize = 10.sp, color = Color.Gray, fontWeight = FontWeight.Bold)
                    if (tx.reviewStatus == "pending") {
                        Text("• PENDING REVIEW", fontSize = 10.sp, color = Color(0xFFF59E0B), fontWeight = FontWeight.Bold)
                    }
                }
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                (if (tx.type == "expense") "- " else "+ ") + formatPaiseToInr(tx.amountPaise),
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                color = if (tx.type == "expense") Color(0xFFEF4444) else Color(0xFF10B981)
            )
        }
    }
}

@Composable
fun UpiReviewScreen(
    pendingList: List<TransactionEntity>,
    onConfirm: (String) -> Unit,
    onReject: (String) -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("Pending UPI Payments", fontWeight = FontWeight.Bold, fontSize = 20.sp)
            Text(
                "Review automatically detected transactions from PhonePe, GPay, or Paytm before adding them to your permanent records.",
                fontSize = 13.sp,
                color = Color.Gray
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        if (pendingList.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(48.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF10B981), modifier = Modifier.size(48.dp))
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("All caught up! No pending payments.", fontWeight = FontWeight.Medium)
                    }
                }
            }
        } else {
            items(pendingList) { tx ->
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                tx.source.uppercase(),
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary,
                                fontSize = 12.sp
                            )
                            Text(
                                (if (tx.type == "expense") "- " else "+ ") + formatPaiseToInr(tx.amountPaise),
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 20.sp,
                                color = if (tx.type == "expense") Color(0xFFEF4444) else Color(0xFF10B981)
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(tx.partyName ?: "Merchant / Recipient", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                        
                        // Full raw SMS / notification text quote
                        if (tx.description.isNotBlank()) {
                            Spacer(modifier = Modifier.height(6.dp))
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(8.dp)) {
                                    Text("Detected Message / Reason:", fontSize = 10.sp, color = Color.Gray, fontWeight = FontWeight.SemiBold)
                                    Text(tx.description, fontSize = 12.sp, color = Color.DarkGray, lineHeight = 16.sp)
                                }
                            }
                        }

                        if (!tx.externalReference.isNullOrBlank()) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Text("UPI Ref: ${tx.externalReference}", fontSize = 11.sp, color = Color.Gray)
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedButton(
                                onClick = { onReject(tx.id) },
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("Reject")
                            }
                            Button(
                                onClick = { onConfirm(tx.id) },
                                modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))
                            ) {
                                Text("Confirm")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SettingsScreen(
    isPermissionGranted: Boolean,
    onGrantPermission: () -> Unit,
    onRefreshPermission: () -> Unit,
    onTriggerTestUpi: (type: String, amountPaise: Long, party: String, desc: String, source: String) -> Unit
) {
    val context = LocalContext.current
    val isConnected by NotificationDebugLog.isServiceConnected

    var supabaseUrlText by remember { mutableStateOf(SyncPreferences.getSupabaseUrl(context)) }
    var supabaseAnonKeyText by remember { mutableStateOf(SyncPreferences.getSupabaseAnonKey(context)) }
    var syncStatusText by remember { mutableStateOf(SyncPreferences.getLastSyncStatus(context)) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Companion Settings & Diagnostics", fontWeight = FontWeight.Bold, fontSize = 20.sp)

        // 1. Supabase Cloud Sync Configuration
        Card(
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Supabase Cloud Sync", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "Sync transactions from this phone to your Montra Vercel dashboard via Supabase.",
                    fontSize = 12.sp,
                    color = Color.Gray
                )
                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = supabaseUrlText,
                    onValueChange = { supabaseUrlText = it },
                    label = { Text("Supabase Project URL") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(8.dp))

                OutlinedTextField(
                    value = supabaseAnonKeyText,
                    onValueChange = { supabaseAnonKeyText = it },
                    label = { Text("Supabase Anon Key (public API key)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(10.dp))

                Text(
                    "Status: $syncStatusText",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    color = if (syncStatusText.contains("Successfully")) Color(0xFF10B981) else Color.DarkGray
                )
                Spacer(modifier = Modifier.height(12.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            SyncPreferences.setSupabaseUrl(context, supabaseUrlText)
                            SyncPreferences.setSupabaseAnonKey(context, supabaseAnonKeyText)
                            SyncWorker.enqueue(context)
                            syncStatusText = "Sync triggered in background..."
                        }
                    ) {
                        Text("Save & Sync Now")
                    }
                }
            }
        }

        // 2. Service Connection Status
        Card(
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(
                containerColor = if (isConnected) Color(0xFFECFDF5) else Color(0xFFFEF2F2)
            )
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Android Listener Service", fontWeight = FontWeight.Bold)
                    Text(
                        if (isConnected) "● CONNECTED" else "● DISCONNECTED",
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp,
                        color = if (isConnected) Color(0xFF10B981) else Color(0xFFEF4444)
                    )
                }
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    if (isConnected) "Service is running in background. Any notification from PhonePe, GPay, Paytm, or SMS will be captured."
                    else "Android OS has paused or not bound the listener service yet. Tap Rebind below or toggle permission off/on.",
                    fontSize = 12.sp,
                    color = Color.DarkGray
                )
                Spacer(modifier = Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                                NotificationListenerService.requestRebind(
                                    ComponentName(context, UpiNotificationListenerService::class.java)
                                )
                            }
                            onRefreshPermission()
                        }
                    ) {
                        Text("Force Rebind Service")
                    }
                    OutlinedButton(onClick = onGrantPermission) {
                        Text("Open Settings")
                    }
                }
            }
        }

        // 3. Battery Optimization
        Card(shape = RoundedCornerShape(12.dp)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Background Battery Protection", fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "Set battery usage to 'Unrestricted' so Android doesn't kill the listener when the app is in the background.",
                    fontSize = 12.sp,
                    color = Color.Gray
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(
                    onClick = {
                        try {
                            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                            context.startActivity(intent)
                        } catch (e: Exception) {
                            val intent = Intent(Settings.ACTION_SETTINGS)
                            context.startActivity(intent)
                        }
                    }
                ) {
                    Text("Check Battery Optimization")
                }
            }
        }

        // 4. Live Notification Sniffer
        Card(shape = RoundedCornerShape(12.dp)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Live Notification Sniffer", fontWeight = FontWeight.Bold)
                    Text("${NotificationDebugLog.entries.size} logs", fontSize = 12.sp, color = Color.Gray)
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "Real-time log of notifications received by your phone. Check here to see exactly what PhonePe/GPay sent.",
                    fontSize = 12.sp,
                    color = Color.Gray
                )
                Spacer(modifier = Modifier.height(10.dp))

                if (NotificationDebugLog.entries.isEmpty()) {
                    Text(
                        "No notifications captured yet.\nWhen your phone receives a UPI notification or SMS, it will appear here instantly with full details.",
                        fontSize = 12.sp,
                        color = Color.Gray,
                        lineHeight = 16.sp
                    )
                } else {
                    NotificationDebugLog.entries.take(10).forEach { entry ->
                        Column(modifier = Modifier.padding(vertical = 4.dp)) {
                            Row(
                                horizontalArrangement = Arrangement.SpaceBetween,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    entry.packageName.substringAfterLast("."),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                Text(entry.timestamp, fontSize = 10.sp, color = Color.Gray)
                            }
                            if (entry.title.isNotBlank()) {
                                Text("Title: ${entry.title}", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                            }
                            Text("Text: ${entry.text}", fontSize = 11.sp, maxLines = 2)
                            Text(
                                "Result: ${entry.result}",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (entry.isSuccess) Color(0xFF10B981) else Color(0xFFEF4444)
                            )
                            HorizontalDivider(
                                modifier = Modifier.padding(top = 6.dp),
                                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                            )
                        }
                    }
                }
            }
        }

        // 5. Test Simulation Buttons
        Card(shape = RoundedCornerShape(12.dp)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Simulate Live Payments & SMS", fontWeight = FontWeight.Bold)
                Text(
                    "Test parser, database insertion, and reason display without spending real money.",
                    fontSize = 12.sp,
                    color = Color.Gray
                )
                Spacer(modifier = Modifier.height(4.dp))

                Button(
                    onClick = {
                        onTriggerTestUpi(
                            "expense",
                            100, // ₹1.00
                            "Yash Singha",
                            "Dear Customer, Acct XXXXX30170 Dr. INR 1.00 on 23/11/26 to Yash Singha; UPI: 669283942258; Bal INR 5,824.81.Not you?SMS BLOCKUPI to 9901771222-CanaraBank",
                            "bank_sms"
                        )
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Canara Bank: Dr. ₹1.00 to Yash Singha")
                }

                Button(
                    onClick = {
                        onTriggerTestUpi(
                            "expense",
                            5000, // ₹50.00
                            "Swiggy",
                            "Rs.50 debited by UPI Swiggy",
                            "bank_sms"
                        )
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("SMS: Rs.50 debited by UPI Swiggy")
                }

                Button(
                    onClick = {
                        onTriggerTestUpi(
                            "income",
                            5000, // ₹50.00
                            "Papa",
                            "Rs. 50 credited by UPI Papa",
                            "bank_sms"
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))
                ) {
                    Text("SMS: Rs.50 credited by UPI Papa")
                }

                Button(
                    onClick = {
                        onTriggerTestUpi(
                            "income",
                            18000, // ₹180.00
                            "AKASH KUMAR",
                            "AKASH KUMAR has sent ₹180 to your bank account Canara Bank-0170",
                            "phonepe"
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669))
                ) {
                    Text("PhonePe: Received ₹180 from AKASH KUMAR")
                }
            }
        }
    }
}

fun formatPaiseToInr(paise: Long): String {
    val rupees = paise / 100.0
    val format = NumberFormat.getCurrencyInstance(Locale("en", "IN"))
    return format.format(rupees)
}

