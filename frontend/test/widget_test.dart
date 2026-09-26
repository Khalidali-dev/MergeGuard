import 'package:flutter_test/flutter_test.dart';
import 'package:mergeguard/main.dart';
import 'package:provider/provider.dart';
import 'package:mergeguard/providers/analysis_provider.dart';

void main() {
  testWidgets('Dashboard renders search bar and idle hint', (tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => AnalysisProvider(),
        child: const MergeGuardApp(),
      ),
    );
    await tester.pump();
    // Top bar title
    expect(find.text('MergeGuard'), findsWidgets);
    // Idle hint
    expect(
      find.text('Enter a GitHub PR URL above to begin analysis'),
      findsOneWidget,
    );
    // Analyze button
    expect(find.text('Analyze PR'), findsOneWidget);
  });
}
