---
layout: posts
title: FinalExam
---

<center><h1><color= "red">Problems that I couldn't solve in the finalExam</color=></h1></center> 
<h2>q4_count_pattern</h2>
<h3>
  int count_pattern(char str1 [], char str2 [])
{int x = 0, y = 0;
    for(int i = 0; i<string_len(str1); i++)
    {
        for(int j = 0; j<string_len(str2); j++)
        {
            x = i + j;
            if(x >= string_len(str1))
            {
                y -= 1;
                break;
            }
            if(str1[x] == str2[j])
                continue;
            else
            {
                y -= 1;
                break;
            }
            
        }
        y += 1;
    }
    return y;
}
</h3>
<h3>Reason: insufficient time</h3>
<h3>New things that i learned = nothing</h3>

<br><br>

--------

<h2>q9_view_memory</h2>
<h3>
  typedef struct {
      char id[9];
      char name[30];
  }student;

  char* get_std_ptr1(student* ps)
  {
      char* ps2 = (char*)ps;
      return ps2+5;
  }
  
  char* get_std_ptr2(student* ps)
  {
      char* ps2 = (char*)ps;
      return ps2+12;
  }
</h3>
<h3>Reason: insufficient time</h3>
<h3>New things that i learned = nothing</h3>

<br><br><br><br>