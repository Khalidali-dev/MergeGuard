import 'package:flutter/foundation.dart';
import '../models/analysis_result.dart';
import '../services/api_service.dart';

export '../services/api_service.dart' show ApiException, ApiErrorKind;

enum AnalysisState { idle, loading, success, error }

class AnalysisProvider extends ChangeNotifier {
  AnalysisState _state = AnalysisState.idle;
  PRAnalysisResult? _result;
  ApiException? _error;

  // Set to true when a new error has arrived that the UI hasn't shown yet.
  // The UI should call [consumeError] after presenting the dialog.
  bool _hasUnseenError = false;

  AnalysisState get state => _state;
  PRAnalysisResult? get result => _result;
  ApiException? get error => _error;

  /// Backwards-compatible string accessor.
  String? get errorMessage => _error?.message;

  /// True when a fresh error is waiting to be shown as a dialog.
  bool get hasUnseenError => _hasUnseenError;

  // ── Actions ────────────────────────────────────────────────────────────────

  Future<void> analyze(String prUrl) async {
    _state = AnalysisState.loading;
    _result = null;
    _error = null;
    _hasUnseenError = false;
    notifyListeners();

    try {
      _result = await ApiService.instance.analyzePr(prUrl);
      _state = AnalysisState.success;
    } on ApiException catch (e) {
      _error = e;
      _hasUnseenError = true;
      _state = AnalysisState.error;
    } catch (e) {
      _error = ApiException(
        kind: ApiErrorKind.server,
        message: e.toString(),
      );
      _hasUnseenError = true;
      _state = AnalysisState.error;
    }

    notifyListeners();
  }

  /// Call this after the error dialog has been shown to clear the unseen flag.
  void consumeError() {
    _hasUnseenError = false;
    // Do NOT call notifyListeners — this is a one-shot consumer flag.
  }

  void reset() {
    _state = AnalysisState.idle;
    _result = null;
    _error = null;
    _hasUnseenError = false;
    notifyListeners();
  }
}
