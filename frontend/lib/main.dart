import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'providers/analysis_provider.dart';
import 'screens/dashboard_screen.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
  ));
  runApp(const MergeGuardApp());
}

class MergeGuardApp extends StatelessWidget {
  const MergeGuardApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AnalysisProvider(),
      child: MaterialApp(
        title: 'MergeGuard',
        debugShowCheckedModeBanner: false,
        theme: buildAppTheme(),
        home: const DashboardScreen(),
      ),
    );
  }
}
