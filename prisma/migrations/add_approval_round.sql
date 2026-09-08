/* Preserve approval history across resubmissions while scoping active checks
   to the current review round. Existing rows are the initial round. */
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF COL_LENGTH('dbo.ITRequestF07', 'approvalRound') IS NULL
    ALTER TABLE dbo.ITRequestF07
      ADD approvalRound int NOT NULL
        CONSTRAINT ITRequestF07_approvalRound_df DEFAULT (1);

  IF COL_LENGTH('dbo.ApprovalHistory', 'approvalRound') IS NULL
    ALTER TABLE dbo.ApprovalHistory
      ADD approvalRound int NOT NULL
        CONSTRAINT ApprovalHistory_approvalRound_df DEFAULT (1);

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.ApprovalHistory')
      AND name = 'ApprovalHistory_request_round_level_idx'
  )
    EXEC(N'CREATE NONCLUSTERED INDEX ApprovalHistory_request_round_level_idx
      ON dbo.ApprovalHistory(requestId, approvalRound, approvalLevel)');

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
