/* ล้างเฉพาะข้อมูลใบคำขอและข้อมูลประกอบทั้งหมด
   ไม่ลบ User, Workflow, Category, Status หรือการตั้งค่าระบบ */
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'requestonline'
    THROW 50001, 'Wrong database. Select requestonline before running this script.', 1;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @DeletedNotifications int, @DeletedAuditLogs int,
            @DeletedApprovals int, @DeletedCorrectionTypes int,
            @DeletedRequests int;

    DELETE FROM dbo.Notification WHERE requestId IS NOT NULL;
    SET @DeletedNotifications = @@ROWCOUNT;

    DELETE FROM dbo.AuditLog WHERE requestId IS NOT NULL;
    SET @DeletedAuditLogs = @@ROWCOUNT;

    DELETE FROM dbo.ApprovalHistory;
    SET @DeletedApprovals = @@ROWCOUNT;

    DELETE FROM dbo.RequestCorrectionType;
    SET @DeletedCorrectionTypes = @@ROWCOUNT;

    DELETE FROM dbo.ITRequestF07;
    SET @DeletedRequests = @@ROWCOUNT;

    COMMIT TRANSACTION;

    SELECT
        @DeletedRequests AS DeletedRequests,
        @DeletedCorrectionTypes AS DeletedCorrectionTypes,
        @DeletedApprovals AS DeletedApprovalHistoryRows,
        @DeletedAuditLogs AS DeletedAuditLogRows,
        @DeletedNotifications AS DeletedNotificationRows;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
