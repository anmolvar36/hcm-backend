-- Add department hierarchy support (parentId self-reference)
ALTER TABLE `department` ADD COLUMN `parentId` VARCHAR(191) NULL;

-- Add foreign key constraint
ALTER TABLE `department` ADD CONSTRAINT `department_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for efficient hierarchy queries
CREATE INDEX `department_parentId_idx` ON `department`(`parentId`);
