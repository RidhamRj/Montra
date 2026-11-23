package com.expensetracker.companion

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.expensetracker.companion.sync.SyncWorker
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
                    onTriggerTestUpi = {
                        scope.launch {
                            val testEntity = TransactionEntity(
                                id = UUID.randomUUID().toString(),
                                userId = "default-user",
                                amountPaise = 24900, // ₹249.00
                                type = "expense",
                                categoryId = "cat-food",
                                description = "Simulated PhonePe Payment",
                                partyName = "Swiggy / Instamart",
                                paymentMethod = "upi",
                                source = "phonepe",
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
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = if (tx.type == "expense") Icons.Default.ArrowDownward else Icons.Default.ArrowUpward,
                contentDescription = null,
                tint = if (tx.type == "expense") Color(0xFFEF4444) else Color(0xFF10B981)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(tx.partyName ?: tx.description.ifEmpty { "Transaction" }, fontWeight = FontWeight.SemiBold)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(tx.source.uppercase(), fontSize = 11.sp, color = Color.Gray)
                    if (tx.reviewStatus == "pending") {
                        Text("• PENDING REVIEW", fontSize = 11.sp, color = Color(0xFFF59E0B), fontWeight = FontWeight.Bold)
                    }
                }
            }
            Text(
                (if (tx.type == "expense") "- " else "+ ") + formatPaiseToInr(tx.amountPaise),
                fontWeight = FontWeight.Bold,
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
                                formatPaiseToInr(tx.amountPaise),
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 20.sp,
                                color = if (tx.type == "expense") Color(0xFFEF4444) else Color(0xFF10B981)
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(tx.partyName ?: "Merchant / Recipient", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                        if (!tx.externalReference.isNullOrBlank()) {
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
    onTriggerTestUpi: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Companion Settings", fontWeight = FontWeight.Bold, fontSize = 20.sp)

        Card(shape = RoundedCornerShape(12.dp)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Notification Access", fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    if (isPermissionGranted) "Status: ACTIVE (Listening for PhonePe, GPay, Paytm)"
                    else "Status: DISABLED (Grant access to auto-detect UPI)",
                    color = if (isPermissionGranted) Color(0xFF10B981) else Color(0xFFEF4444),
                    fontSize = 13.sp
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onGrantPermission) {
                        Text(if (isPermissionGranted) "Manage Permissions" else "Grant Permission")
                    }
                    if (!isPermissionGranted) {
                        OutlinedButton(onClick = onRefreshPermission) {
                            Text("Refresh Status")
                        }
                    }
                }
            }
        }

        Card(shape = RoundedCornerShape(12.dp)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Simulate UPI Payment", fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "Simulate an incoming PhonePe payment notification to test detection, deduplication, and the review drawer.",
                    fontSize = 13.sp,
                    color = Color.Gray
                )
                Spacer(modifier = Modifier.height(12.dp))
                Button(onClick = onTriggerTestUpi) {
                    Text("Trigger Simulated PhonePe Payment (₹249)")
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

