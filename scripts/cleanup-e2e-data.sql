/*
  Remove Playwright/E2E test accounts and the test data owned by them.

  Safety:
  1. This script only targets usernames beginning with the literal text "e2e_".
  2. @Execute defaults to 0 (preview only).
  3. Every delete runs in one transaction and rolls back on any error.

  Usage:
  - Run once with @Execute = 0 and review the counts/list.
  - Change @Execute to 1 and run again to delete.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Execute bit = 0;
DECLARE @ExpectedDatabase sysname = N'requestonline';

IF DB_NAME() <> @ExpectedDatabase
BEGIN
    THROW 50001, 'Wrong database. Select the requestonline database before running this script.', 1;
END;

DROP TABLE IF EXISTS #E2EUsers;
DROP TABLE IF EXISTS #E2ERequests;

CREATE TABLE #E2EUsers
(
    id int NOT NULL PRIMARY KEY,
    username nvarchar(255) NOT NULL
);

INSERT INTO #E2EUsers (id, username)
SELECT id, username
FROM dbo.[User]
WHERE username LIKE N'e2e[_]%';

CREATE TABLE #E2ERequests
(
    id int NOT NULL PRIMARY KEY
);

INSERT INTO #E2ERequests (id)
SELECT r.id
FROM dbo.ITRequestF07 AS r
INNER JOIN #E2EUsers AS u ON u.id = r.requesterId;

DECLARE @UserCount int = (SELECT COUNT(*) FROM #E2EUsers);
DECLARE @RequestCount int = (SELECT COUNT(*) FROM #E2ERequests);

SELECT
    @UserCount AS E2EUsers,
    @RequestCount AS E2ERequests,
    (SELECT COUNT(*) FROM dbo.ApprovalHistory h
      WHERE h.approverId IN (SELECT id FROM #E2EUsers)
         OR h.requestId IN (SELECT id FROM #E2ERequests)) AS ApprovalHistoryRows,
    (SELECT COUNT(*) FROM dbo.AuditLog a
      WHERE a.userId IN (SELECT id FROM #E2EUsers)
         OR a.requestId IN (SELECT id FROM #E2ERequests)) AS AuditLogRows,
    (SELECT COUNT(*) FROM dbo.Notification n
      WHERE n.userId IN (SELECT id FROM #E2EUsers)
         OR n.requestId IN (SELECT id FROM #E2ERequests)) AS NotificationRows,
    (SELECT COUNT(*) FROM dbo.SpecialApproverMapping s
      WHERE s.userId IN (SELECT id FROM #E2EUsers)) AS SpecialApproverRows;

SELECT TOP (100)
    u.id,
    u.username
FROM #E2EUsers AS u
ORDER BY u.id;

IF @UserCount = 0
BEGIN
    PRINT 'No e2e_ users found. Nothing to delete.';
    RETURN;
END;

IF @Execute = 0
BEGIN
    PRINT 'PREVIEW ONLY: no data was deleted. Set @Execute = 1 to confirm deletion.';
    RETURN;
END;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @DeletedNotifications int = 0;
    DECLARE @DeletedAuditLogs int = 0;
    DECLARE @DeletedApprovals int = 0;
    DECLARE @DeletedCorrectionTypes int = 0;
    DECLARE @DeletedRequests int = 0;
    DECLARE @DeletedSpecialApprovers int = 0;
    DECLARE @DeletedCategoryLinks int = 0;
    DECLARE @DeletedUsers int = 0;

    DELETE n
    FROM dbo.Notification AS n
    WHERE n.userId IN (SELECT id FROM #E2EUsers)
       OR n.requestId IN (SELECT id FROM #E2ERequests);
    SET @DeletedNotifications = @@ROWCOUNT;

    DELETE a
    FROM dbo.AuditLog AS a
    WHERE a.userId IN (SELECT id FROM #E2EUsers)
       OR a.requestId IN (SELECT id FROM #E2ERequests);
    SET @DeletedAuditLogs = @@ROWCOUNT;

    DELETE h
    FROM dbo.ApprovalHistory AS h
    WHERE h.approverId IN (SELECT id FROM #E2EUsers)
       OR h.requestId IN (SELECT id FROM #E2ERequests);
    SET @DeletedApprovals = @@ROWCOUNT;

    DELETE c
    FROM dbo.RequestCorrectionType AS c
    WHERE c.requestId IN (SELECT id FROM #E2ERequests);
    SET @DeletedCorrectionTypes = @@ROWCOUNT;

    DELETE r
    FROM dbo.ITRequestF07 AS r
    WHERE r.id IN (SELECT id FROM #E2ERequests);
    SET @DeletedRequests = @@ROWCOUNT;

    DELETE s
    FROM dbo.SpecialApproverMapping AS s
    WHERE s.userId IN (SELECT id FROM #E2EUsers);
    SET @DeletedSpecialApprovers = @@ROWCOUNT;

    DELETE cu
    FROM dbo._CategoryToUser AS cu
    WHERE cu.B IN (SELECT id FROM #E2EUsers);
    SET @DeletedCategoryLinks = @@ROWCOUNT;

    DELETE u
    FROM dbo.[User] AS u
    WHERE u.id IN (SELECT id FROM #E2EUsers);
    SET @DeletedUsers = @@ROWCOUNT;

    COMMIT TRANSACTION;

    SELECT
        @DeletedUsers AS DeletedUsers,
        @DeletedRequests AS DeletedRequests,
        @DeletedApprovals AS DeletedApprovalHistoryRows,
        @DeletedAuditLogs AS DeletedAuditLogRows,
        @DeletedNotifications AS DeletedNotificationRows,
        @DeletedCorrectionTypes AS DeletedRequestCorrectionTypeRows,
        @DeletedSpecialApprovers AS DeletedSpecialApproverRows,
        @DeletedCategoryLinks AS DeletedCategoryUserLinks;

    PRINT 'E2E cleanup completed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
