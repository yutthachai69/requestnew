/* Workflow lifecycle, immutable request snapshots and conditional transitions. */
SET NOCOUNT ON;
SET XACT_ABORT ON;

/* Keep DDL in its own transaction/batch: SQL Server must compile later queries
   after the new columns exist. */
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID('dbo.WorkflowVersion', 'U') IS NULL
    CREATE TABLE dbo.WorkflowVersion (id int IDENTITY(1,1) NOT NULL PRIMARY KEY, categoryId int NOT NULL, correctionTypeId int NULL, versionNumber int NOT NULL, status nvarchar(20) NOT NULL CONSTRAINT WorkflowVersion_status_df DEFAULT ('DRAFT'), label nvarchar(255) NULL, createdById int NULL, createdAt datetime2(7) NOT NULL CONSTRAINT WorkflowVersion_createdAt_df DEFAULT (SYSUTCDATETIME()), publishedAt datetime2(7) NULL);
  IF COL_LENGTH('dbo.WorkflowTransition', 'workflowVersionId') IS NULL ALTER TABLE dbo.WorkflowTransition ADD workflowVersionId int NULL;
  IF COL_LENGTH('dbo.WorkflowTransition', 'conditionKey') IS NULL ALTER TABLE dbo.WorkflowTransition ADD conditionKey nvarchar(64) NOT NULL CONSTRAINT WorkflowTransition_conditionKey_df DEFAULT ('ALWAYS');
  IF COL_LENGTH('dbo.ITRequestF07', 'workflowVersionId') IS NULL ALTER TABLE dbo.ITRequestF07 ADD workflowVersionId int NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'WorkflowVersion_category_fk') ALTER TABLE dbo.WorkflowVersion ADD CONSTRAINT WorkflowVersion_category_fk FOREIGN KEY (categoryId) REFERENCES dbo.Category(id);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'WorkflowVersion_correctionType_fk') ALTER TABLE dbo.WorkflowVersion ADD CONSTRAINT WorkflowVersion_correctionType_fk FOREIGN KEY (correctionTypeId) REFERENCES dbo.CorrectionType(id);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'WorkflowVersion_createdBy_fk') ALTER TABLE dbo.WorkflowVersion ADD CONSTRAINT WorkflowVersion_createdBy_fk FOREIGN KEY (createdById) REFERENCES dbo.[User](id);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'WorkflowTransition_workflowVersion_fk') ALTER TABLE dbo.WorkflowTransition ADD CONSTRAINT WorkflowTransition_workflowVersion_fk FOREIGN KEY (workflowVersionId) REFERENCES dbo.WorkflowVersion(id);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'ITRequestF07_workflowVersion_fk') ALTER TABLE dbo.ITRequestF07 ADD CONSTRAINT ITRequestF07_workflowVersion_fk FOREIGN KEY (workflowVersionId) REFERENCES dbo.WorkflowVersion(id);
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_WorkflowVersion_scope_status') CREATE INDEX IX_WorkflowVersion_scope_status ON dbo.WorkflowVersion(categoryId, correctionTypeId, status);
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_WorkflowTransition_workflowVersion') CREATE INDEX IX_WorkflowTransition_workflowVersion ON dbo.WorkflowTransition(workflowVersionId, currentStatusId, conditionKey);
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ITRequestF07_workflowVersion') CREATE INDEX IX_ITRequestF07_workflowVersion ON dbo.ITRequestF07(workflowVersionId);
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;

/* Backfill existing rules into published baseline v1 and add the checkbox branch. */
BEGIN TRY
  BEGIN TRANSACTION;
  DECLARE @CategoryId int, @CorrectionTypeId int, @VersionId int;
  DECLARE version_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT id, CAST(NULL AS int) FROM dbo.Category UNION SELECT DISTINCT categoryId, correctionTypeId FROM dbo.WorkflowTransition WHERE workflowVersionId IS NULL;
  OPEN version_cursor; FETCH NEXT FROM version_cursor INTO @CategoryId, @CorrectionTypeId;
  WHILE @@FETCH_STATUS = 0
  BEGIN
    SET @VersionId = NULL;
    SELECT TOP (1) @VersionId = id FROM dbo.WorkflowVersion WHERE categoryId = @CategoryId AND ((correctionTypeId = @CorrectionTypeId) OR (correctionTypeId IS NULL AND @CorrectionTypeId IS NULL)) AND versionNumber = 1 ORDER BY id;
    IF @VersionId IS NULL BEGIN INSERT dbo.WorkflowVersion(categoryId, correctionTypeId, versionNumber, status, label, publishedAt) VALUES (@CategoryId, @CorrectionTypeId, 1, 'PUBLISHED', 'Baseline v1', SYSUTCDATETIME()); SET @VersionId = SCOPE_IDENTITY(); END;
    UPDATE wt SET workflowVersionId = @VersionId FROM dbo.WorkflowTransition wt WHERE wt.workflowVersionId IS NULL AND wt.categoryId = @CategoryId AND ((wt.correctionTypeId = @CorrectionTypeId) OR (wt.correctionTypeId IS NULL AND @CorrectionTypeId IS NULL));
    FETCH NEXT FROM version_cursor INTO @CategoryId, @CorrectionTypeId;
  END;
  CLOSE version_cursor; DEALLOCATE version_cursor;
  DECLARE @ItWorking int = (SELECT id FROM dbo.Status WHERE code = 'IT_WORKING'), @ItProcess int = (SELECT id FROM dbo.[Action] WHERE actionName = 'IT_PROCESS'), @WaitingClose int = (SELECT id FROM dbo.Status WHERE code = 'WAITING_IT_CLOSE');
  UPDATE wt SET conditionKey = 'ACCOUNT_RECHECK_REQUIRED' FROM dbo.WorkflowTransition wt WHERE wt.currentStatusId = @ItWorking AND wt.actionId = @ItProcess AND wt.conditionKey = 'ALWAYS';
  INSERT dbo.WorkflowTransition(workflowVersionId, categoryId, correctionTypeId, currentStatusId, actionId, requiredRoleId, nextStatusId, stepSequence, filterByDepartment, conditionKey)
    SELECT workflowVersionId, categoryId, correctionTypeId, currentStatusId, actionId, requiredRoleId, @WaitingClose, stepSequence, filterByDepartment, 'ACCOUNT_RECHECK_SKIPPED' FROM dbo.WorkflowTransition wt WHERE wt.currentStatusId = @ItWorking AND wt.actionId = @ItProcess AND wt.conditionKey = 'ACCOUNT_RECHECK_REQUIRED' AND NOT EXISTS (SELECT 1 FROM dbo.WorkflowTransition x WHERE x.workflowVersionId = wt.workflowVersionId AND x.currentStatusId = wt.currentStatusId AND x.actionId = wt.actionId AND x.conditionKey = 'ACCOUNT_RECHECK_SKIPPED');
  UPDATE r SET workflowVersionId = v.id FROM dbo.ITRequestF07 r JOIN dbo.WorkflowVersion v ON v.categoryId = r.categoryId AND v.correctionTypeId IS NULL AND v.versionNumber = 1 AND v.status = 'PUBLISHED' WHERE r.workflowVersionId IS NULL;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
