/*
  Per-request routing after IT completes the correction.

  Existing open requests keep the previous behaviour (accounting recheck),
  while new requests explicitly store the requester's choice.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.ITRequestF07', 'requiresAccountRecheck') IS NULL
    BEGIN
        ALTER TABLE dbo.ITRequestF07
            ADD requiresAccountRecheck bit NOT NULL
                CONSTRAINT ITRequestF07_requiresAccountRecheck_df DEFAULT (0);

        EXEC sys.sp_executesql N'
            UPDATE dbo.ITRequestF07
            SET requiresAccountRecheck = 1
            WHERE ISNULL(status, ''PENDING'') NOT IN (''CLOSED'', ''REJECTED'');
        ';
    END;

    DECLARE @WaitingAccount2 int = (SELECT id FROM dbo.Status WHERE code = 'WAITING_ACCOUNT_2');
    DECLARE @WaitingItClose int = (SELECT id FROM dbo.Status WHERE code = 'WAITING_IT_CLOSE');
    DECLARE @Closed int = (SELECT id FROM dbo.Status WHERE code = 'CLOSED');
    DECLARE @Revision int = (SELECT id FROM dbo.Status WHERE code = 'REVISION');
    DECLARE @ApproveAction int = (SELECT id FROM dbo.Action WHERE actionName = 'APPROVE');
    DECLARE @RejectAction int = (SELECT id FROM dbo.Action WHERE actionName = 'REJECT');
    DECLARE @ConfirmAction int = (SELECT id FROM dbo.Action WHERE actionName = 'CONFIRM_COMPLETE');
    DECLARE @AccountantRole int = (SELECT id FROM dbo.Role WHERE roleName = 'Accountant');
    DECLARE @ItReviewerRole int = (SELECT id FROM dbo.Role WHERE roleName = 'IT Reviewer');

    IF @WaitingAccount2 IS NULL OR @WaitingItClose IS NULL OR @Closed IS NULL
       OR @Revision IS NULL OR @ApproveAction IS NULL OR @RejectAction IS NULL
       OR @ConfirmAction IS NULL OR @AccountantRole IS NULL OR @ItReviewerRole IS NULL
    BEGIN
        THROW 50002, 'Required workflow master data is missing.', 1;
    END;

    /* Every category follows the same route after accounting recheck. */
    UPDATE wt
    SET wt.nextStatusId = @WaitingItClose,
        wt.stepSequence = 5,
        wt.requiredRoleId = @AccountantRole
    FROM dbo.WorkflowTransition AS wt
    WHERE wt.currentStatusId = @WaitingAccount2
      AND wt.actionId = @ApproveAction;

    /* IT Reviewer route is also available to requests that skip accounting. */
    UPDATE wt
    SET wt.nextStatusId = @Closed,
        wt.stepSequence = 6,
        wt.requiredRoleId = @ItReviewerRole
    FROM dbo.WorkflowTransition AS wt
    WHERE wt.currentStatusId = @WaitingItClose
      AND wt.actionId = @ConfirmAction;

    UPDATE wt
    SET wt.nextStatusId = @Revision,
        wt.stepSequence = 0,
        wt.requiredRoleId = @ItReviewerRole
    FROM dbo.WorkflowTransition AS wt
    WHERE wt.currentStatusId = @WaitingItClose
      AND wt.actionId = @RejectAction;

    INSERT INTO dbo.WorkflowTransition
        (categoryId, correctionTypeId, currentStatusId, actionId, requiredRoleId,
         nextStatusId, stepSequence, filterByDepartment)
    SELECT c.id, NULL, @WaitingItClose, @ConfirmAction, @ItReviewerRole,
           @Closed, 6, 0
    FROM dbo.Category AS c
    WHERE NOT EXISTS
    (
        SELECT 1
        FROM dbo.WorkflowTransition AS wt
        WHERE wt.categoryId = c.id
          AND wt.correctionTypeId IS NULL
          AND wt.currentStatusId = @WaitingItClose
          AND wt.actionId = @ConfirmAction
    );

    INSERT INTO dbo.WorkflowTransition
        (categoryId, correctionTypeId, currentStatusId, actionId, requiredRoleId,
         nextStatusId, stepSequence, filterByDepartment)
    SELECT c.id, NULL, @WaitingItClose, @RejectAction, @ItReviewerRole,
           @Revision, 0, 0
    FROM dbo.Category AS c
    WHERE NOT EXISTS
    (
        SELECT 1
        FROM dbo.WorkflowTransition AS wt
        WHERE wt.categoryId = c.id
          AND wt.correctionTypeId IS NULL
          AND wt.currentStatusId = @WaitingItClose
          AND wt.actionId = @RejectAction
    );

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
