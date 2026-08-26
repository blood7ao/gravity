use tokio::process::Child;

#[cfg(target_os = "windows")]
pub fn attach_process_guard(child: &Child) {
    use std::mem::size_of;
    use std::os::windows::io::AsRawHandle;
    use winapi::um::jobapi2::{
        AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
    };
    use winapi::um::winnt::{
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    unsafe {
        let job = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
        if !job.is_null() {
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(
                job,
                winapi::um::winnt::JobObjectExtendedLimitInformation,
                &mut info as *mut _ as *mut _,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if let Some(raw_handle) = child.raw_handle() {
                AssignProcessToJobObject(job, raw_handle as _);
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn attach_process_guard(_child: &Child) {
    // Unix platforms manage process group termination via PGID in agy_session
}
